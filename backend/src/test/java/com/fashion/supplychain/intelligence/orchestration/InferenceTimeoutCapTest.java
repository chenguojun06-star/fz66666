package com.fashion.supplychain.intelligence.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code IntelligenceInferenceOrchestrator} 的「按场景超时封顶」契约测试。
 *
 * <p>背景（2026-09-24，从 t_ai_job_run_log 里查出来的）：
 * 模型保活探针 {@code XiaoyunModelWarmup.warmup}（scene={@code model-warmup}）
 * 只发一个 1-token 的 "ping"，但上游模型故障时单次耗时达 **900 秒**
 * （= 3 × 默认封顶 300s，多级调用累加），2026-09-15 凌晨 02:33~05:18 连续 11 次如此。
 *
 * <p>保活探针等久了就**完全失去意义** —— 用户早就等不及了。故给它单独封顶到 10 秒。
 * 本测试把这个行为钉住，防止以后有人"顺手"把封顶删掉。
 */
@DisplayName("IntelligenceInferenceOrchestrator - 按场景超时封顶")
class InferenceTimeoutCapTest {

    private int cap(String scene, int configuredSeconds) {
        IntelligenceInferenceOrchestrator orch = new IntelligenceInferenceOrchestrator();
        Integer v = ReflectionTestUtils.invokeMethod(
                orch, "resolveEffectiveTimeoutSeconds", scene, configuredSeconds);
        assertThat(v).as("resolveEffectiveTimeoutSeconds 应可调用").isNotNull();
        return v;
    }

    @Test
    @DisplayName("保活探针封顶 10 秒 —— 回归：曾让它等满 900 秒")
    void warmupProbeIsCappedShort() {
        // 直连默认超时 90s、封顶默认 300s，对保活探针都太长
        assertThat(cap("model-warmup", 90)).isEqualTo(10);
        assertThat(cap("model-warmup", 300)).isEqualTo(10);
    }

    @Test
    @DisplayName("已有场景封顶不被影响")
    void existingSceneCapsUnchanged() {
        assertThat(cap("ai-advisor", 90)).isEqualTo(20);
        assertThat(cap("nl-intent", 90)).isEqualTo(12);
        assertThat(cap("daily-brief", 90)).isEqualTo(5);
        assertThat(cap("critic_review", 90)).isEqualTo(30);
    }

    @Test
    @DisplayName("未列出的场景走默认封顶 300 秒（业务场景允许长等待）")
    void unknownSceneUsesDefaultCap() {
        assertThat(cap("some-business-scene", 90)).isEqualTo(90);
        assertThat(cap("some-business-scene", 1000)).isEqualTo(300);
    }

    @Test
    @DisplayName("配置值过小有下限保护（不会出现 0 秒超时）")
    void tinyConfiguredTimeoutIsRaisedToFloor() {
        assertThat(cap("some-business-scene", 1)).isEqualTo(5);
        assertThat(cap("some-business-scene", 0)).isEqualTo(5);
    }
}
