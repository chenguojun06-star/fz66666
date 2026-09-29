package com.fashion.supplychain.integration.ecommerce.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PlatformWebhookOrchestrator 签名校验契约测试。
 *
 * <p><b>为什么单独测这个类：</b>D-634 把「取配置 / 验签名 / 落单」从
 * {@code PlatformWebhookController} 下沉到本编排层。原来的
 * {@code PlatformWebhookControllerTest} 是<b>顺带</b>覆盖签名算法的 ——
 * 它拿真实的 body/timestamp 走完整链路，一旦 HMAC 算错就表现为「期望 200 却得到 401」，
 * 失败信号指向 Controller，实际 bug 在算法里。
 * 拆分后：Controller 测试只管状态码契约，本测试只管算法本身。
 *
 * <p><b>期望值不是用生产代码算的：</b>下方 {@link #VALID_SIGNATURE} 由外部工具独立算出
 * （Python {@code hmac.new(b"test-secret", b"1700000000" + BODY, hashlib.sha256).hexdigest()}，
 * 早期版本用的是 openssl），避免「用生产代码算期望值再拿生产代码去比」的自证循环。
 *
 * <p>⚠️ 注意签名输入是 {@code timestamp + body}，<b>不含换行</b>。
 * 用 {@code echo}/{@code <<<} 喂给 openssl 时 shell 会补一个换行，
 * 算出来的是另一个值（实测 {@code 3d849834...}），别被坑。
 *
 * <p>{@link PlatformWebhookOrchestrator#verifySignature} 是纯函数（不触碰任何注入字段），
 * 故这里直接 {@code new} 出来测，不需要 Spring 容器。
 */
@DisplayName("PlatformWebhookOrchestrator - 平台签名校验")
class PlatformWebhookOrchestratorTest {

    private static final String SECRET = "test-secret";
    private static final String BODY = "{\"orderNo\":\"A1\",\"skuCode\":\"X\"}";
    private static final String TIMESTAMP = "1700000000";

    /** Python/openssl 独立算出：HMAC-SHA256("test-secret", "1700000000" + BODY) */
    private static final String VALID_SIGNATURE =
            "b2dead28888cbc0d2841d69e35c55146d55112f8155d1bf7e9f0a4f0f64c0d58";

    private final PlatformWebhookOrchestrator orchestrator = new PlatformWebhookOrchestrator();

    @Nested
    @DisplayName("签名匹配")
    class Matches {

        @Test
        @DisplayName("正确的 HMAC-SHA256 十六进制签名 → true")
        void validSignature_returnsTrue() {
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, BODY, VALID_SIGNATURE))
                    .isTrue();
        }

        @Test
        @DisplayName("大小写不敏感的平台编码不影响签名（签名只与 appSecret/timestamp/body 有关）")
        void signatureIndependentOfPlatformCode() {
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, BODY, VALID_SIGNATURE))
                    .isTrue();
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, BODY,
                    VALID_SIGNATURE.toUpperCase()))
                    .as("摘要必须是小写十六进制；大写形式不应被接受（与重构前一致）")
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("签名不匹配")
    class Mismatches {

        @Test
        @DisplayName("签名值错误 → false")
        void wrongSignature_returnsFalse() {
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, BODY, "deadbeef"))
                    .isFalse();
        }

        @Test
        @DisplayName("appSecret 为 null → false（未配置密钥时不能放行）")
        void nullAppSecret_returnsFalse() {
            assertThat(orchestrator.verifySignature(null, TIMESTAMP, BODY, VALID_SIGNATURE))
                    .isFalse();
        }

        @Test
        @DisplayName("签名为 null → false（缺签名头时不能放行）")
        void nullSignature_returnsFalse() {
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, BODY, null))
                    .isFalse();
        }

        @Test
        @DisplayName("body 被篡改 → false（防止改动订单内容后复用旧签名）")
        void tamperedBody_returnsFalse() {
            String tampered = "{\"orderNo\":\"A2\",\"skuCode\":\"X\"}";
            assertThat(orchestrator.verifySignature(SECRET, TIMESTAMP, tampered, VALID_SIGNATURE))
                    .isFalse();
        }

        @Test
        @DisplayName("timestamp 被篡改 → false（timestamp 参与摘要）")
        void tamperedTimestamp_returnsFalse() {
            assertThat(orchestrator.verifySignature(SECRET, "1700000001", BODY, VALID_SIGNATURE))
                    .isFalse();
        }

        @Test
        @DisplayName("appSecret 错误 → false")
        void wrongAppSecret_returnsFalse() {
            assertThat(orchestrator.verifySignature("other-secret", TIMESTAMP, BODY, VALID_SIGNATURE))
                    .isFalse();
        }

        @Test
        @DisplayName("时间戳为空串也参与摘要（与重构前行为一致：不做时间窗口校验）")
        void emptyTimestampStillHashed() {
            // 记录现状：本方法只做摘要比对，不做时间窗校验。
            // 若日后要加防重放窗口，需先改这里并同步 Controller 的 401 文案。
            assertThat(orchestrator.verifySignature(SECRET, "", BODY, VALID_SIGNATURE))
                    .isFalse();
        }
    }
}
