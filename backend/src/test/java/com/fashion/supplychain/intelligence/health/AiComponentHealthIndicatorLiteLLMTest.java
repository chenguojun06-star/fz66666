package com.fashion.supplychain.intelligence.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * D-859：LiteLLM 未启用时健康检查必须返回 UNKNOWN。
 *
 * <p>事故背景（2026-10-24 生产实测）：`/actuator/health` 长期返回 DEGRADED，
 * liveness/readiness 却都是 UP。逐组件排除后定位到 LiteLLM ——
 * `ai.gateway.litellm.enabled` 默认 false，而 `ping()` 对「未启用」也返回 false，
 * `checkLiteLLM()` 于是把它当成 DOWN。可选组件没部署 ≠ 故障，
 * 但它让「真实故障」与「一切正常」显示同一个状态，监控彻底失去分辨能力。
 */
class AiComponentHealthIndicatorLiteLLMTest {

    private final AiComponentHealthIndicator indicator = new AiComponentHealthIndicator();

    private Object checkLiteLLM() {
        return ReflectionTestUtils.invokeMethod(indicator, "checkLiteLLM");
    }

    private boolean flag(Object result, String field) {
        Object value = ReflectionTestUtils.getField(result, field);
        assertThat(value).as("HealthResult.%s 必须存在", field).isNotNull();
        return (Boolean) value;
    }

    @Test
    @DisplayName("未启用 → UNKNOWN（不得 DOWN，否则整体 health 永久 DEGRADED）")
    void disabledLiteLLMIsUnknown() {
        ReflectionTestUtils.setField(indicator, "liteLLMEnabled", false);

        Object result = checkLiteLLM();

        assertThat(result).isNotNull();
        assertThat(flag(result, "up")).isFalse();
        assertThat(flag(result, "unknown"))
                .as("未配置的可选组件必须返回 UNKNOWN，不参与 DEGRADED 判定")
                .isTrue();
    }

    @Test
    @DisplayName("已启用但编排器未注入 → UNKNOWN（仍不能算 DOWN）")
    void enabledButMissingOrchestratorIsUnknown() {
        ReflectionTestUtils.setField(indicator, "liteLLMEnabled", true);

        Object result = checkLiteLLM();

        assertThat(result).isNotNull();
        assertThat(flag(result, "unknown")).isTrue();
    }
}
