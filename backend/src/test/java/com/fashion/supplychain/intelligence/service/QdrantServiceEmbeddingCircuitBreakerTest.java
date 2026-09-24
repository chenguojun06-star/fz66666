package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.service.QdrantService.EmbeddingFailureKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code QdrantService} Embedding 远端熔断契约测试。
 *
 * <p>守护的核心契约：<b>限流（429）必须熔断，且必须能自愈</b>。
 *
 * <p>事故背景（2026-09-24 线上实测）：智谱 embedding-3 打满配额后，24h 内产生
 * **122 次 429**、**62 次降级为伪向量**，而每次仍要白等 2.9~4.4 秒才走兜底。
 * 根因是原实现只对 404/401/402 熔断（那类不会自愈），**429 不熔断** → 限流期间每次请求都在空转：
 * 配额照耗、时间照花、结果一模一样还是伪向量。
 *
 * <p>因此这里有两条必须同时成立的断言：
 * <ol>
 *   <li>连续限流达到阈值后**必须**熔断（{@code isEmbeddingRateLimited()} == true），不再打远端；</li>
 *   <li>冷却结束后**必须**放行一次探测并复位（半开），否则一次限流就会把远端判死到进程重启。</li>
 * </ol>
 */
@DisplayName("QdrantService - Embedding 远端熔断（限流/永久两类）")
class QdrantServiceEmbeddingCircuitBreakerTest {

    private static QdrantService newService(int threshold, long cooldownMs) {
        QdrantService svc = new QdrantService();
        ReflectionTestUtils.setField(svc, "embeddingRateLimitThreshold", threshold);
        ReflectionTestUtils.setField(svc, "embeddingRateLimitCooldownMs", cooldownMs);
        return svc;
    }

    private static void fail(QdrantService svc, String msg) {
        ReflectionTestUtils.invokeMethod(svc, "onEmbeddingFailure", msg);
    }

    private static boolean rateLimited(QdrantService svc) {
        return Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(svc, "isEmbeddingRateLimited"));
    }

    private static boolean remoteUnavailable(QdrantService svc) {
        return Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(svc, "isEmbeddingRemoteUnavailable"));
    }

    // ==================== 失败分类（纯函数，无需实例） ====================

    @Test
    @DisplayName("429 / Too Many Requests / quota → 限流类")
    void rateLimitMessagesAreClassifiedAsRateLimited() {
        assertThat(QdrantService.classifyEmbeddingFailure("429 Too Many Requests"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
        assertThat(QdrantService.classifyEmbeddingFailure("429"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
        assertThat(QdrantService.classifyEmbeddingFailure("Too Many Requests on POST request"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
        assertThat(QdrantService.classifyEmbeddingFailure("Rate limit reached for requests"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
        assertThat(QdrantService.classifyEmbeddingFailure("insufficient_quota: quota exceeded"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
        assertThat(QdrantService.classifyEmbeddingFailure("request was throttled"))
                .isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
    }

    @Test
    @DisplayName("404 / 401 / 403 / 402 → 永久类（配置错误，不会自愈）")
    void configErrorsAreClassifiedAsPermanent() {
        assertThat(QdrantService.classifyEmbeddingFailure("404 Not Found"))
                .isEqualTo(EmbeddingFailureKind.PERMANENT);
        assertThat(QdrantService.classifyEmbeddingFailure("401 Unauthorized"))
                .isEqualTo(EmbeddingFailureKind.PERMANENT);
        assertThat(QdrantService.classifyEmbeddingFailure("403 Forbidden"))
                .isEqualTo(EmbeddingFailureKind.PERMANENT);
        assertThat(QdrantService.classifyEmbeddingFailure("402 Payment Required"))
                .isEqualTo(EmbeddingFailureKind.PERMANENT);
    }

    @Test
    @DisplayName("超时/连接类 → 不算失败类型（重试有意义，不熔断）")
    void transientErrorsAreNotCircuitBroken() {
        assertThat(QdrantService.classifyEmbeddingFailure("Read timed out"))
                .isEqualTo(EmbeddingFailureKind.NONE);
        assertThat(QdrantService.classifyEmbeddingFailure("Connection reset by peer"))
                .isEqualTo(EmbeddingFailureKind.NONE);
        assertThat(QdrantService.classifyEmbeddingFailure(null))
                .isEqualTo(EmbeddingFailureKind.NONE);
        assertThat(QdrantService.classifyEmbeddingFailure(""))
                .isEqualTo(EmbeddingFailureKind.NONE);
    }

    @Test
    @DisplayName("余额不足识别 —— 智谱用 429+code1113 表达欠费，文案必须指向「充值」而不是「查限流」")
    void billingExhaustionIsRecognised() {
        // 线上真实响应体
        String real = "429 Too Many Requests on POST request for \"https://open.bigmodel.cn/api/paas/v4/embeddings\": "
                + "\"{\"error\":{\"code\":\"1113\",\"message\":\"余额不足或无可用资源包,请充值。\"}}\"";
        assertThat(QdrantService.isBillingExhausted(real)).isTrue();
        assertThat(QdrantService.isBillingExhausted("insufficient_quota")).isTrue();
        assertThat(QdrantService.isBillingExhausted("insufficient balance")).isTrue();
        assertThat(QdrantService.isBillingExhausted("402 Payment Required")).isTrue();
        // 普通限流不能误判成欠费
        assertThat(QdrantService.isBillingExhausted("429 Too Many Requests (rate limit)")).isFalse();
        assertThat(QdrantService.isBillingExhausted(null)).isFalse();
        // 但欠费仍要能触发限流熔断（会自愈：充值后自动恢复，无需重启）
        assertThat(QdrantService.classifyEmbeddingFailure(real)).isEqualTo(EmbeddingFailureKind.RATE_LIMITED);
    }

    @Test
    @DisplayName("欠费熔断会打上 billing 标记，成功探测后清除")
    void billingFlagIsSetAndCleared() {
        QdrantService svc = newService(1, 600_000L);
        fail(svc, "429 ... 余额不足或无可用资源包,请充值。");
        assertThat(ReflectionTestUtils.getField(svc, "embeddingBillingExhausted")).isEqualTo(true);
        ReflectionTestUtils.invokeMethod(svc, "onEmbeddingSuccess");
        assertThat(ReflectionTestUtils.getField(svc, "embeddingBillingExhausted")).isEqualTo(false);
    }

    // ==================== 熔断状态机 ====================

    @Test
    @DisplayName("初始状态：远端可用，未熔断")
    void initiallyNotBroken() {
        QdrantService svc = newService(3, 600_000L);
        assertThat(rateLimited(svc)).isFalse();
        assertThat(remoteUnavailable(svc)).isFalse();
    }

    @Test
    @DisplayName("偶发一次限流（未达阈值）不熔断 —— 不能因单次抖动就把远端判死")
    void singleRateLimitDoesNotBreak() {
        QdrantService svc = newQdrantServiceThresholds3();
        fail(svc, "429 Too Many Requests");
        fail(svc, "429 Too Many Requests");
        assertThat(rateLimited(svc)).isFalse();
    }

    @Test
    @DisplayName("连续限流达阈值 → 熔断（关键：这正是线上缺失的行为）")
    void consecutiveRateLimitsBreakTheCircuit() {
        QdrantService svc = newQdrantServiceThresholds3();
        for (int i = 0; i < 3; i++) fail(svc, "429 Too Many Requests");
        assertThat(rateLimited(svc)).isTrue();
        assertThat(remoteUnavailable(svc)).isTrue();
    }

    @Test
    @DisplayName("冷却结束后自动半开：放行一次探测并复位计数")
    void cooldownExpiryReopensCircuit() {
        // 注意：冷却时长在实现里有 1000ms 下限保护（防误配成 0 导致"熔断等于没熔断"），
        // 所以这里必须配 ≥1000ms 才能测出"冷却结束即放行"，配 50ms 会被夹到 1000ms。
        QdrantService svc = newService(2, 1000L);
        fail(svc, "429");
        fail(svc, "429");
        assertThat(rateLimited(svc)).isTrue();

        // 等过冷却期
        try { Thread.sleep(1150L); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        // 半开：本次放行（不再熔断），且计数已复位
        assertThat(rateLimited(svc)).isFalse();
        assertThat(ReflectionTestUtils.getField(svc, "embeddingRateLimitedUntil")).isEqualTo(0L);
        assertThat(hitsOf(svc)).isEqualTo(0);
    }

    /** 读取限流计数（字段是 AtomicInteger，直接断言对象会拿到 AtomicInteger(0) 而非 0） */
    private static int hitsOf(QdrantService svc) {
        return ((java.util.concurrent.atomic.AtomicInteger)
                ReflectionTestUtils.getField(svc, "embeddingRateLimitHits")).get();
    }

    @Test
    @DisplayName("冷却时长有 1000ms 下限保护 —— 误配成 0 / 负数不会让熔断形同虚设")
    void cooldownIsClampedToAtLeastOneSecond() {
        QdrantService svc = newService(1, 0L);
        fail(svc, "429");
        long until = (long) ReflectionTestUtils.getField(svc, "embeddingRateLimitedUntil");
        assertThat(until - System.currentTimeMillis()).isGreaterThan(500L);
    }

    @Test
    @DisplayName("探测成功后彻底复位 —— 冷却期内不会再误熔断")
    void successResetsTheBreaker() {
        QdrantService svc = newService(2, 600_000L);
        fail(svc, "429");
        assertThat(rateLimited(svc)).isFalse(); // 未达阈值
        ReflectionTestUtils.invokeMethod(svc, "onEmbeddingSuccess");
        // 复位后再失败 1 次仍不该熔断（说明计数确实被清了）
        fail(svc, "429");
        assertThat(rateLimited(svc)).isFalse();
        assertThat(hitsOf(svc)).isEqualTo(1);
    }

    @Test
    @DisplayName("配置类错误 → 永久熔断，且不受冷却期影响")
    void permanentFailureBreaksForWholeRun() {
        QdrantService svc = newService(3, 600_000L);
        fail(svc, "401 Unauthorized");
        assertThat(remoteUnavailable(svc)).isTrue();
        assertThat((boolean) ReflectionTestUtils.getField(svc, "embeddingRemoteBroken")).isTrue();
        // 限流熔断未被触发（两者是不同机制）
        assertThat(rateLimited(svc)).isFalse();
    }

    private static QdrantService newQdrantServiceThresholds3() {
        return newService(3, 600_000L);
    }
}
