package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
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

    @Value("${ai.budget.tenant-daily-token-limit:3000000}")
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

    public List<Long> getBudgetStatus() {
        long usage = getTodayUsage();
        return List.of(usage, dailyTokenLimit, dailyTokenLimit - usage);
    }

    private String buildKey(Long tenantId) {
        return KEY_PREFIX + tenantId + ":" + LocalDate.now() + ":tokens";
    }
}
