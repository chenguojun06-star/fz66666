package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AI token 预算护栏回归守护（D-700）
 *
 * <p><b>被修的 P0</b>：{@code AiAgentTokenBudgetService} 的三个方法
 * （{@code canInvoke} / {@code tryDeduct} / {@code recordUsage}）原本都有这一行：
 * <pre>{@code
 * Long tenantId = UserContext.tenantId();
 * if (tenantId == null) return true;   // canInvoke：直接放行
 * if (tenantId == null) return;        // tryDeduct / recordUsage：直接返回
 * }</pre>
 *
 * <p>而<b>后台定时任务与系统级 agent 恰恰没有 UserContext 租户上下文</b> ——
 * 也就是说「花得最多的那一批调用」原本<b>完整绕过</b>了 50 万/租户/日的上限：
 * <ul>
 *   <li>{@code canInvoke} 直接放行 → 限额形同虚设；</li>
 *   <li>{@code recordUsage} 直接返回 → 这些 token 一个都没进桶 → 无法归因。</li>
 * </ul>
 * 实测印证：tenant 2 当日已用 45.6 万 token（逼近限额）仍未被拦，
 * 而系统桶用量根本查不到。
 *
 * <p><b>修复</b>：无租户上下文时归入「系统桶」tenant 0 统一计量与限流，
 * 而不是跳过 —— 跳过等于这部分开销既不受控也不可见。
 *
 * <p><b>为什么用反射改私有字段测</b>：预算判定完全依赖
 * {@code UserContext} 这个 ThreadLocal（静态、无注入入口），
 * 且限流要走 Redis Lua。直接构造完整 Spring 上下文会把测试拖到依赖真实 Redis。
 * 这里用反射注入 mock 的 RedisTemplate，只验证<b>护栏判定逻辑</b>这一层，
 * 与 CI 既有风格一致（同 {@code SseAsyncDispatchAuthorizationTest} 只取关键过滤器）。
 */
@DisplayName("AI token 预算护栏（D-700：后台任务不再绕过限额）")
class AiAgentTokenBudgetServiceTest {

    private static final String SYSTEM_BUCKET_PREFIX = "ai:budget:0:";

    private final AiAgentTokenBudgetService service = new AiAgentTokenBudgetService();

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    @Test
    @DisplayName("无租户上下文（后台任务）时不再直接放行 —— 会被系统桶限额拦下")
    void canInvoke_backgroundTaskWithoutTenant_isCheckedAgainstSystemBucket() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        // Lua 返回 -1 = 已超限
        when(redis.execute(any(), anyList(), any())).thenReturn(-1L);
        inject(redis, true, 500000L);

        UserContext.clear(); // 无租户上下文，等价于 cron / 系统级任务

        assertThat(service.canInvoke())
                .as("后台任务原本 tenantId==null 直接 return true，完全绕过 50 万/日上限。"
                        + "修复后应走系统桶(tenant 0)并被真实限额约束")
                .isFalse();
    }

    @Test
    @DisplayName("无租户上下文时用量记入系统桶，而不是被丢弃")
    void recordUsage_backgroundTask_goesToSystemBucket() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        // 注意：不能在 when(redis.opsForValue()) 里再调 redis.opsForValue() ——
        // 那是嵌套 stubbing，Mockito 会抛 UnfinishedStubbingException。
        var valueOps = mock(org.springframework.data.redis.core.ValueOperations.class);
        when(redis.opsForValue()).thenReturn(valueOps);
        when(valueOps.increment(any(), any(Long.class))).thenReturn(1234L);
        inject(redis, true, 500000L);

        UserContext.clear();
        service.recordUsage(1000, 234);

        var captor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(valueOps)
                .increment(captor.capture(), any(Long.class));

        assertThat(captor.getValue())
                .as("无租户上下文的 token 必须落到系统桶 ai:budget:0:<日期>:tokens，"
                        + "否则后台开销永远查不到")
                .startsWith(SYSTEM_BUCKET_PREFIX);
    }

    @Test
    @DisplayName("预算总闸关闭时保持放行（不改变既有应急开关语义）")
    void canInvoke_budgetDisabled_alwaysAllows() throws Exception {
        inject(mock(StringRedisTemplate.class), false, 500000L);
        UserContext.clear();

        assertThat(service.canInvoke())
                .as("ai.budget.enabled=false 是运维应急止血开关，必须仍然全量放行")
                .isTrue();
    }

    private void inject(StringRedisTemplate redis, boolean enabled, long dailyLimit) throws Exception {
        set("redis", redis);
        set("enabled", enabled);
        set("dailyTokenLimit", dailyLimit);
    }

    private void set(String name, Object value) throws Exception {
        Field f = AiAgentTokenBudgetService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(service, value);
    }
}
