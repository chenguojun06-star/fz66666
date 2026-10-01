package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@Lazy
public class AiAgentTokenBudgetService {

    private static final String KEY_PREFIX = "ai:budget:";
    /**
     * D-700：系统桶 tenantId —— 承载「没有 UserContext 租户上下文」的调用
     * （后台定时任务、系统级 agent、跨租户巡检）。
     * 取 0 是因为它同时是 t_ai_cost_tracking.tenant_id 的 NOT NULL 兜底值，
     * 两张表用同一个口径，排查时可直接对齐。
     */
    private static final long SYSTEM_TENANT_ID = 0L;
    private static final Duration TTL = Duration.ofHours(36);

    private static final String ATOMIC_CHECK_AND_DEDUCT_LUA =
            "local key = KEYS[1] " +
            "local limit = tonumber(ARGV[1]) " +
            "local tokens = tonumber(ARGV[2]) " +
            "local ttl_secs = tonumber(ARGV[3]) " +
            "local current = tonumber(redis.call('GET', key) or '0') " +
            "if current + tokens > limit then " +
            "  return -1 " +
            "end " +
            "local after = redis.call('INCRBY', key, tokens) " +
            "if after == tokens then " +
            "  redis.call('EXPIRE', key, ttl_secs) " +
            "end " +
            "return after";

    private static final String ATOMIC_PEEK_LUA =
            "local key = KEYS[1] " +
            "local limit = tonumber(ARGV[1]) " +
            "local current = tonumber(redis.call('GET', key) or '0') " +
            "if current >= limit then " +
            "  return -1 " +
            "end " +
            "return current";

    private final DefaultRedisScript<Long> atomicCheckAndDeductScript = new DefaultRedisScript<>(ATOMIC_CHECK_AND_DEDUCT_LUA, Long.class);
    private final DefaultRedisScript<Long> atomicPeekScript = new DefaultRedisScript<>(ATOMIC_PEEK_LUA, Long.class);

    @Autowired(required = false)
    private StringRedisTemplate redis;

    // 2026-09-13：RAG 改造（召回3→20+rerank+多Agent分析）后每轮 token 暴涨。
    // 20万 → 50万 仍被秒烧穿（多Agent图单次问话 5-8 次 LLM），提到 200 万/日。
    // 配套 D-395 已收紧多Agent图闸门，从源头压低消耗。
    //
    // D-469（2026-09-20）：用户要求把上限压到 **50万/租户/日**。
    // 注意：历史上 50 万被秒烧穿，所以本次**同时**做了降本改造，否则会撞墙：
    //   ① AiAgentToolAdvisor 去掉「工具数<=8 就不过滤」的短路，意图过滤真正生效
    //   ② 新增单次调用工具数硬上限 MAX_TOOLS_PER_CALL（工具定义是 prompt token 最大变量）
    //   ③ ALWAYS_INCLUDE 从 3 个收到 1 个
    //   ④ AiChatContextOrchestrator 各段 LIMIT 收紧
    // 仍可用环境变量 AI_BUDGET_TENANT_DAILY_TOKEN_LIMIT 覆盖（临时调整请改环境变量）。
    @Value("${ai.budget.tenant-daily-token-limit:500000}")
    private long dailyTokenLimit;

    @Value("${ai.budget.enabled:true}")
    private boolean enabled;

    public boolean canInvoke() {
        if (!enabled || redis == null) return true;
        Long tenantId = UserContext.tenantId();
        // D-700：原实现 tenantId == null 就 return true（直接放行）。
        // 但后台定时任务 / 系统级 agent 恰恰**没有** UserContext —— 也就是说
        // 「花得最多的那一批调用」原本完全绕过了预算护栏，50 万/租户/日的上限
        // 对它们形同虚设（实测 tenant 2 已用 45.6 万仍未被拦）。
        //
        // 改为：把无租户上下文的调用归到「系统桶」tenant 0 统一计量与限流。
        // 不直接拒绝 —— 拒绝会让所有后台巡检/日报/多智能体任务整体停摆；
        // 而是让它们至少**可被观测、可被总量限制**，并由运维用
        // AI_BUDGET_TENANT_DAILY_TOKEN_LIMIT / AI_CRON_INFERENCE_ENABLED 统一收口。
        long effectiveTenantId = tenantId != null ? tenantId : SYSTEM_TENANT_ID;
        try {
            String key = buildKey(effectiveTenantId);
            Long result = redis.execute(atomicPeekScript,
                    Collections.singletonList(key),
                    String.valueOf(dailyTokenLimit));
            if (result != null && result == -1L) {
                log.warn("[AiBudget] {} 今日 token 已超限, limit={}",
                        tenantId != null ? ("租户 " + tenantId) : "系统桶(无租户上下文)", dailyTokenLimit);
                return false;
            }
            return true;
        } catch (Exception e) {
            // D-700：预检失败不再「静默放行」。改为 warn + 放行（保可用性），
            // 但 warn 级别保证 Redis 故障时预算失效会被看见，而不是像过去一样
            // 只在正常路径上无声通过。
            log.warn("[AiBudget] 预检失败，降级放行（预算护栏暂时失效，请检查 Redis）: {}", e.getMessage());
            return true;
        }
    }

    public boolean tryDeduct(int promptTokens, int completionTokens) {
        if (!enabled || redis == null) return true;
        Long tenantId = UserContext.tenantId();
        // D-700：与 canInvoke 一致，无租户上下文归系统桶，不再「直接放行不计量」。
        long effectiveTenantId = tenantId != null ? tenantId : SYSTEM_TENANT_ID;
        long total = Math.max(0, promptTokens) + Math.max(0, completionTokens);
        if (total == 0) return true;
        try {
            String key = buildKey(effectiveTenantId);
            Long result = redis.execute(atomicCheckAndDeductScript,
                    Collections.singletonList(key),
                    String.valueOf(dailyTokenLimit),
                    String.valueOf(total),
                    String.valueOf(TTL.getSeconds()));
            if (result != null && result == -1L) {
                log.warn("[AiBudget] {} token 预算不足, 请求扣除={}, limit={}",
                        tenantId != null ? ("租户 " + tenantId) : "系统桶(无租户上下文)", total, dailyTokenLimit);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("[AiBudget] 原子扣减失败，降级放行: {}", e.getMessage());
            return true;
        }
    }

    public void recordUsage(int promptTokens, int completionTokens) {
        if (!enabled || redis == null) return;
        Long tenantId = UserContext.tenantId();
        // D-700：原实现 tenantId == null 直接 return —— 后台任务消耗的 token
        // 一个都没进桶，导致「系统桶用量」永远查不到，后台开销无法归因。
        long effectiveTenantId = tenantId != null ? tenantId : SYSTEM_TENANT_ID;
        long total = Math.max(0, promptTokens) + Math.max(0, completionTokens);
        if (total == 0) return;
        try {
            String key = buildKey(effectiveTenantId);
            Long after = redis.opsForValue().increment(key, total);
            if (after != null && after.equals(total)) {
                redis.expire(key, TTL);
            }
        } catch (Exception e) {
            log.warn("[AiBudget] 累加失败: {}", e.getMessage());
        }
    }

    public long getTodayUsage() {
        if (redis == null) return 0L;
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return 0L;
        try {
            String val = redis.opsForValue().get(buildKey(tenantId));
            return val == null ? 0L : Long.parseLong(val);
        } catch (Exception e) {
            return 0L;
        }
    }

    public long getDailyLimit() {
        return dailyTokenLimit;
    }

    /**
     * 重置当前租户今日配额（管理动作：仅租户主账号/超管可触达的 Controller 调用）。
     * 返回释放的 token 数；-1 表示重置失败。
     */
    public long resetToday() {
        if (redis == null) return -1L;
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return -1L;
        try {
            String key = buildKey(tenantId);
            String val = redis.opsForValue().get(key);
            long usage = val == null ? 0L : Long.parseLong(val);
            redis.delete(key);
            log.info("[AiBudget] 租户 {} 今日配额已重置（释放 {} tokens）", tenantId, usage);
            return usage;
        } catch (Exception e) {
            log.warn("[AiBudget] 配额重置失败 tenant={}: {}", tenantId, e.getMessage());
            return -1L;
        }
    }

    public List<Long> getBudgetStatus() {
        long usage = getTodayUsage();
        return List.of(usage, dailyTokenLimit, dailyTokenLimit - usage);
    }

    private String buildKey(Long tenantId) {
        return KEY_PREFIX + tenantId + ":" + LocalDate.now() + ":tokens";
    }
}
