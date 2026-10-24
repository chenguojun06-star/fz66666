package com.fashion.supplychain.intelligence.orchestration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * D-874：反思引擎节流的守护用例。
 *
 * <p>为什么这条防线必须存在：反思是异步后处理，**不参与已经发给用户的回答**，
 * 所以它是最安全的提速点——但正因为它不影响正确性，一旦有人把节流间隔改坏
 * （比如改成 0 或极小值），生产不会报错、只会悄悄把 fashion-async 线程池占满，
 * 表现为「小云整体变慢」，很难回溯。这里把它钉死。
 */
class ConversationReflectionThrottleTest {

    private ConversationReflectionOrchestrator newOrchestrator(long intervalMs) {
        ConversationReflectionOrchestrator o =
                new ConversationReflectionOrchestrator(null, null, null);
        ReflectionTestUtils.setField(o, "reflectionMinIntervalMs", intervalMs);
        return o;
    }

    @Test
    @DisplayName("冷却期内：同一用户第二次应被跳过")
    void secondCallWithinCooldownSkipped() {
        ConversationReflectionOrchestrator o = newOrchestrator(30_000);
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();   // 首次放行
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isTrue();    // 冷却期内跳过
    }

    @Test
    @DisplayName("不同用户互不影响（节流按 租户+会话 维度）")
    void differentUsersIndependent() {
        ConversationReflectionOrchestrator o = newOrchestrator(30_000);
        assertThat(o.shouldSkipByThrottle(2L, "sess-A")).isFalse();
        assertThat(o.shouldSkipByThrottle(2L, "sess-B")).isFalse();   // 另一会话放行
        assertThat(o.shouldSkipByThrottle(106L, "sess-A")).isFalse(); // 另一租户放行
    }

    @Test
    @DisplayName("interval<=0 表示不节流（运维可关）")
    void zeroIntervalDisablesThrottle() {
        ConversationReflectionOrchestrator o = newOrchestrator(0);
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();
    }

    @Test
    @DisplayName("冷却期过后应重新放行")
    void afterCooldownAllowedAgain() {
        ConversationReflectionOrchestrator o = newOrchestrator(50);
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isTrue();
        try {
            Thread.sleep(60);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        assertThat(o.shouldSkipByThrottle(2L, "sess-1")).isFalse();
    }
}
