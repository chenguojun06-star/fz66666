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
        if (tenantId == null) return true;
        try {
            String key = buildKey(tenantId);
            Long result = redis.execute(atomicPeekScript,
                    Collections.singletonList(key),
                    String.valueOf(dailyTokenLimit));
            if (result != null && result == -1L) {
                log.warn("[AiBudget] 租户 {} 今日 token 已超限, limit={}", tenantId, dailyTokenLimit);
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("[AiBudget] 预检失败，降级放行: {}", e.getMessage());
            return true;
        }
    }

    public boolean tryDeduct(int promptTokens, int completionTokens) {
        if (!enabled || redis == null) return true;
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return true;
        long total = Math.max(0, promptTokens) + Math.max(0, completionTokens);
        if (total == 0) return true;
        try {
            String key = buildKey(tenantId);
            Long result = redis.execute(atomicCheckAndDeductScript,
                    Collections.singletonList(key),
                    String.valueOf(dailyTokenLimit),
                    String.valueOf(total),
                    String.valueOf(TTL.getSeconds()));
            if (result != null && result == -1L) {
                log.warn("[AiBudget] 租户 {} token 预算不足, 请求扣除={}, limit={}", tenantId, total, dailyTokenLimit);
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
        if (tenantId == null) return;
        long total = Math.max(0, promptTokens) + Math.max(0, completionTokens);
        if (total == 0) return;
        try {
            String key = buildKey(tenantId);
            Long after = redis.opsForValue().increment(key, total);
            if (after != null && after.equals(total)) {
                redis.expire(key, TTL);
            }
        } catch (Exception e) {
            log.debug("[AiBudget] 累加失败: {}", e.getMessage());
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
