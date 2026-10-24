package com.fashion.supplychain.intelligence.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * D-858：输出 token 上限口径守护。
 *
 * <p>D-856 把 QuickPath 从 2048 压到 1024 是「小云 60 秒」的核心修复，但当时没有任何用例锁住这两个数字——
 * 下次有人为了「多输出点」把它改回 2048，只会看到首字正常、总耗时悄悄回到 60 秒，没有任何红灯。
 *
 * <p>同时锁住兜底口径：{@code null} 与未知 scene 必须同值，避免再出现「只改已知场景、漏掉兜底」的分裂。
 */
class SpringAiInferenceAdapterMaxTokensTest {

    private final SpringAiInferenceAdapter adapter = new SpringAiInferenceAdapter();

    private int resolve(String scene) {
        Integer value = ReflectionTestUtils.invokeMethod(adapter, "resolveMaxTokens", scene);
        assertThat(value).as("resolveMaxTokens 必须返回非空值").isNotNull();
        return value;
    }

    @Test
    @DisplayName("QuickPath（ai-advisor）必须是 1024 —— 改回 2048 会让单次耗时回到 60 秒")
    void quickPathUsesShortLimit() {
        assertThat(resolve("ai-advisor"))
                .as("ai-advisor 是 60 秒耗时的直接来源，默认必须锁在 1024")
                .isEqualTo(1024);
    }

    @Test
    @DisplayName("Agent 循环（agent-loop）必须是 3072")
    void agentLoopUsesMediumLimit() {
        assertThat(resolve("agent-loop")).isEqualTo(3072);
    }

    @Test
    @DisplayName("null 场景与未知场景同口径（兜底 2048），不得各写各的")
    void nullAndUnknownSceneShareSameFallback() {
        assertThat(resolve(null))
                .as("null 曾经单独硬编码 2048，与 default 重复，容易只改一处")
                .isEqualTo(resolve("scene-that-does-not-exist"));
        assertThat(resolve(null)).isEqualTo(2048);
    }

    @Test
    @DisplayName("配置值优先于代码默认值（可配置就必须真的可配）")
    void configuredValueOverridesDefault() {
        ReflectionTestUtils.setField(adapter, "aiAdvisorMaxTokens", 512);

        assertThat(resolve("ai-advisor"))
                .as("xiaoyun.scene-max-tokens.ai-advisor 注入后必须生效")
                .isEqualTo(512);
    }
}
