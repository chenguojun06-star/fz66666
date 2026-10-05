package com.fashion.supplychain.intelligence.config;

import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 日报 AI 建议「缓存死循环」回归守护（D-702）
 *
 * <p><b>事故现象</b>（生产实测）：
 * <pre>
 *   daily-brief 一天调用 98 次，每次都真的调 DeepSeek
 *   日志刷满：[Cache] Redis 写入失败，跳过缓存
 *               cache=daily-brief err=Cache 'daily-brief' does not allow 'null' values
 *   同时：[AiAdvisor] 租户 2 今日AI调用已达配额上限 50，请求被拦截
 *   结果：租户日配额被日报刷爆，而 AI 建议始终是空的
 * </pre>
 *
 * <p><b>根因链条</b>（每一环单独看都合理，串起来就是死循环）：
 * <ol>
 *   <li>{@code RedisCacheManager} 全局 {@code disableCachingNullValues()}；</li>
 *   <li>AI 不可用 / 配额拦截 / 调用失败 → 方法返回 {@code null}；</li>
 *   <li>{@code @Cacheable} 仍尝试写入 null → RedisCache 抛 IllegalArgumentException；</li>
 *   <li>异常被 {@code handleCachePutError} 吞掉降级 → <b>缓存永远写不进去</b>；</li>
 *   <li>下次请求再次调用 AI → 再次失败 → 再次抛异常 → 回到第 3 步。</li>
 * </ol>
 *
 * <p>本守护确保不复发：null 结果不入缓存、TTL 与「每天一份」的 key 语义对齐。
 */
@DisplayName("日报缓存死循环（D-702：98 次调用 + 建议始终为空）")
class DailyBriefCacheLoopTest {

    private static final List<String> REDIS_CANDIDATES = List.of(
            "src/main/java/com/fashion/supplychain/config/RedisConfig.java",
            "backend/src/main/java/com/fashion/supplychain/config/RedisConfig.java");

    private static String read(List<String> c) throws Exception {
        for (String p : c) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到文件: " + c);
    }

    @Test
    @DisplayName("① getDailyAdvice 必须声明 unless=#result == null：否则 null 写入触发异常、缓存永不生效")
    void nullResultMustNotBeCached() throws Exception {
        Method m = AiAdvisorService.class.getMethod("getDailyAdvice", String.class);
        var cacheable = m.getAnnotation(
                org.springframework.cache.annotation.Cacheable.class);
        assertThat(cacheable).as("应带 @Cacheable").isNotNull();
        assertThat(cacheable.unless())
                .as("缺 unless 时 null 会写入 Redis 并抛 IllegalArgumentException，"
                        + "异常被吞掉后缓存永不生效，导致每次都重调 AI（实测 98 次/天并刷爆配额）")
                .isEqualTo("#result == null");
    }

    @Test
    @DisplayName("② daily-brief TTL 必须与「每天一份」的 key 语义对齐，不能是 5 分钟")
    void ttlMatchesOncePerDaySemantics() throws Exception {
        String s = read(REDIS_CANDIDATES);
        assertThat(s)
                .as("key 里带 LocalDate.now()，TTL 却是 5 分钟，看板一天刷几十次必然每次失效")
                .contains("configMap.put(\"daily-brief\", defaultConfig.entryTtl(remainingToday()))");
        assertThat(s)
                .as("旧的 5 分钟 TTL 配置不应残留")
                .doesNotContain("\"daily-brief\", defaultConfig.entryTtl(Duration.ofMinutes(5))");
    }

    @Test
    @DisplayName("② remainingToday 必须落在「当天剩余」且有上下界，防止 0 或负值 TTL")
    void remainingTodayIsBounded() throws Exception {
        String s = read(REDIS_CANDIDATES);
        int start = s.indexOf("private static Duration remainingToday()");
        assertThat(start).as("应存在 remainingToday()").isGreaterThan(0);
        String m = s.substring(start, Math.min(start + 900, s.length()));
        assertThat(m)
                .as("午夜前后必须兜底为 1 分钟；Redis 不接受非正 TTL")
                .contains("Duration.ofMinutes(1)")
                .contains("Duration.ofHours(24)");
    }

    @Test
    @DisplayName("③ 全局仍禁止缓存 null：不得为了修日报而让所有缓存都开始存 null")
    void globalNullCachingStillDisabled() throws Exception {
        String s = read(REDIS_CANDIDATES);
        assertThat(s)
                .as("disableCachingNullValues 是全局好实践，只应在业务层用 unless 规避，"
                        + "改成允许缓存 null 会让全站缓存都去存 null")
                .contains(".disableCachingNullValues()");
    }

    @Test
    @DisplayName("④ 日报业务数据不走缓存：延长 TTL 不得让数据变陈旧")
    void businessDataIsNotCached() throws Exception {
        // getBrief 内的实时查询
        String s = read(List.of(
                "src/main/java/com/fashion/supplychain/dashboard/orchestration/DailyBriefOrchestrator.java",
                "backend/src/main/java/com/fashion/supplychain/dashboard/orchestration/DailyBriefOrchestrator.java"));
        assertThat(s)
                .as("逾期数/高风险订单/扫码入库量必须每次重新查库，只有 AI 建议文案走缓存")
                .contains("countOverdueOrders()");
        // AI 建议才走缓存
        assertThat(s).contains("getTimedDailyAdvice");
        assertThat(AiAdvisorService.class.getMethod("getDailyAdvice", String.class)
                .getAnnotation(org.springframework.cache.annotation.Cacheable.class))
                .as("只有 AI 建议带缓存注解")
                .isNotNull();
    }
}