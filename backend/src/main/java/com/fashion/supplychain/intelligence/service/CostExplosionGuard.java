package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 成本爆炸防御（借鉴 Ruflo 成本爆炸三大原因 + 防御）。
 *
 * <p>三大防御：
 * <ol>
 *   <li><b>上下文肥大检测</b>（Context Bloat Detection）— system prompt 超长 / 对话历史超轮 → 触发压缩</li>
 *   <li><b>多 Agent 重复检测</b>（Multi-Agent Duplication Detection）— 同工具同参数近期已调用 → 返回缓存</li>
 *   <li><b>重试风暴熔断</b>（Retry Storm Circuit Breaker）— 5 分钟内同工具失败 ≥5 次 → 熔断 10 分钟</li>
 * </ol>
 *
 * <p>所有 Redis 操作 try-catch 降级：Redis 不可用时静默放行，不阻断主流程。
 * 多租户隔离（P0 铁律 4）：所有 Redis key 带 tenantId 前缀。
 */
@Slf4j
@Service
@Lazy
public class CostExplosionGuard {

    /** Redis key 前缀 */
    private static final String CIRCUIT_KEY_PREFIX = "cost_guard:circuit_breaker:";
    private static final String FAIL_COUNT_KEY_PREFIX = "cost_guard:tool_fail_count:";
    private static final String DUP_CACHE_KEY_PREFIX = "cost_guard:tool_call_cache:";

    @Value("${xiaoyun.cost-guard.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.cost-guard.context-bloat-threshold:12000}")
    private int contextBloatThreshold;

    @Value("${xiaoyun.cost-guard.context-history-limit:10}")
    private int contextHistoryLimit;

    @Value("${xiaoyun.cost-guard.circuit-breaker-threshold:5}")
    private int circuitBreakerThreshold;

    @Value("${xiaoyun.cost-guard.circuit-breaker-window-minutes:5}")
    private int circuitBreakerWindowMinutes;

    @Value("${xiaoyun.cost-guard.circuit-breaker-recovery-minutes:10}")
    private int circuitBreakerRecoveryMinutes;

    @Value("${xiaoyun.cost-guard.duplicate-cache-ttl-hours:1}")
    private int duplicateCacheTtlHours;

    @Autowired(required = false)
    private StringRedisTemplate redis;

    /** 统计指标（D-021 合规可观测） */
    private final AtomicLong contextBloatDetectedCount = new AtomicLong(0);
    private final AtomicLong circuitBreakerTrippedCount = new AtomicLong(0);
    private final AtomicLong duplicateCacheHitCount = new AtomicLong(0);
    private final AtomicLong duplicateCacheMissCount = new AtomicLong(0);

    // ==================== 1. 上下文肥大检测 ====================

    /**
     * 检测上下文是否肥大（system prompt 超长 或 对话历史超轮）。
     *
     * @param ctx Agent 循环上下文
     * @return true 表示肥大（应触发压缩）
     */
    public boolean checkContextBloat(AgentLoopContext ctx) {
        if (!enabled || ctx == null) return false;
        boolean bloated = detectBloat(ctx);
        if (bloated) {
            contextBloatDetectedCount.incrementAndGet();
            log.warn("[CostGuard] 上下文肥大检测触发: messages={} promptCharsHint={}",
                    ctx.getMessages() != null ? ctx.getMessages().size() : 0,
                    ctx.getPageContext() != null ? ctx.getPageContext().length() : 0);
        }
        return bloated;
    }

    private boolean detectBloat(AgentLoopContext ctx) {
        if (ctx.getMessages() != null && ctx.getMessages().size() > contextHistoryLimit * 2) {
            return true;
        }
        return estimateSystemPromptChars(ctx) > contextBloatThreshold;
    }

    private int estimateSystemPromptChars(AgentLoopContext ctx) {
        int total = 0;
        if (ctx.getMessages() != null) {
            for (var msg : ctx.getMessages()) {
                if ("system".equals(msg.getRole()) && msg.getContent() != null) {
                    total += msg.getContent().length();
                }
            }
        }
        if (ctx.getPageContext() != null) {
            total += ctx.getPageContext().length();
        }
        return total;
    }

    /**
     * 压缩上下文：截断旧轮次消息（保留 system + 最近 N 轮）。
     *
     * @param ctx Agent 循环上下文
     * @return 被移除的消息数
     */
    public int compressContext(AgentLoopContext ctx) {
        if (!enabled || ctx == null || ctx.getMessages() == null) return 0;
        int keepCount = contextHistoryLimit * 2;
        var messages = ctx.getMessages();
        int total = messages.size();
        if (total <= keepCount) return 0;
        // 保留前 2 条（system/plan）+ 最后 keepCount-2 条
        int removeStart = 2;
        int removeEnd = total - (keepCount - 2);
        int removed = 0;
        for (int i = removeEnd - 1; i >= removeStart; i--) {
            var msg = messages.get(i);
            if (!"system".equals(msg.getRole())) {
                messages.remove(i);
                removed++;
            }
        }
        log.info("[CostGuard] 上下文压缩: 移除 {} 条旧消息, 剩余 {}", removed, messages.size());
        return removed;
    }

    // ==================== 2. 多 Agent 重复检测 ====================

    /**
     * 检测工具调用是否重复（同工具同参数近期已调用）。
     *
     * @param tenantId   租户 ID
     * @param toolName   工具名
     * @param paramsHash 参数哈希
     * @return 缓存结果（如果近期已调用过）
     */
    public Optional<String> checkDuplicateToolCall(Long tenantId, String toolName, String paramsHash) {
        if (!enabled || redis == null || tenantId == null) {
            duplicateCacheMissCount.incrementAndGet();
            return Optional.empty();
        }
        try {
            String key = buildDupCacheKey(tenantId, toolName, paramsHash);
            String cached = redis.opsForValue().get(key);
            if (cached != null) {
                duplicateCacheHitCount.incrementAndGet();
                log.info("[CostGuard] 重复工具调用命中缓存: tenant={} tool={}", tenantId, toolName);
                return Optional.of(cached);
            }
            duplicateCacheMissCount.incrementAndGet();
        } catch (Exception e) {
            log.debug("[CostGuard] 重复检测异常（降级放行）: {}", e.getMessage());
            duplicateCacheMissCount.incrementAndGet();
        }
        return Optional.empty();
    }

    /**
     * 记录工具调用结果（用于后续重复检测）。
     *
     * @param tenantId   租户 ID
     * @param toolName   工具名
     * @param paramsHash 参数哈希
     * @param result     工具结果
     */
    public void recordToolCall(Long tenantId, String toolName, String paramsHash, String result) {
        if (!enabled || redis == null || tenantId == null || result == null) return;
        try {
            String key = buildDupCacheKey(tenantId, toolName, paramsHash);
            // 结果过长则截断，避免 Redis 内存爆炸
            String stored = result.length() > 4096 ? result.substring(0, 4096) : result;
            redis.opsForValue().set(key, stored, duplicateCacheTtlHours, TimeUnit.HOURS);
        } catch (Exception e) {
            log.debug("[CostGuard] 工具调用记录异常（不影响主流程）: {}", e.getMessage());
        }
    }

    // ==================== 3. 重试风暴熔断 ====================

    /**
     * 判断工具是否被熔断（5 分钟内失败 ≥5 次 → 熔断 10 分钟）。
     *
     * @param tenantId 租户 ID
     * @param toolName 工具名
     * @return true 表示熔断中（应跳过调用）
     */
    public boolean isCircuitBroken(Long tenantId, String toolName) {
        if (!enabled || redis == null || tenantId == null) return false;
        try {
            String key = buildCircuitKey(tenantId, toolName);
            Boolean exists = redis.hasKey(key);
            if (Boolean.TRUE.equals(exists)) {
                log.warn("[CostGuard] 工具熔断中: tenant={} tool={}", tenantId, toolName);
                return true;
            }
        } catch (Exception e) {
            log.debug("[CostGuard] 熔断检测异常（降级放行）: {}", e.getMessage());
        }
        return false;
    }

    /**
     * 记录工具失败（用于熔断判断）。
     * 5 分钟窗口内失败达阈值 → 设置熔断 key（TTL 10 分钟）。
     *
     * @param tenantId 租户 ID
     * @param toolName 工具名
     */
    public void recordToolFailure(Long tenantId, String toolName) {
        if (!enabled || redis == null || tenantId == null) return;
        try {
            String failKey = buildFailCountKey(tenantId, toolName);
            Long count = redis.opsForValue().increment(failKey);
            if (count != null && count == 1) {
                redis.expire(failKey, circuitBreakerWindowMinutes, TimeUnit.MINUTES);
            }
            if (count != null && count >= circuitBreakerThreshold) {
                String circuitKey = buildCircuitKey(tenantId, toolName);
                redis.opsForValue().set(circuitKey, String.valueOf(System.currentTimeMillis()),
                        circuitBreakerRecoveryMinutes, TimeUnit.MINUTES);
                circuitBreakerTrippedCount.incrementAndGet();
                log.warn("[CostGuard] 工具熔断触发: tenant={} tool={} failCount={}", tenantId, toolName, count);
                redis.delete(failKey);
            }
        } catch (Exception e) {
            log.debug("[CostGuard] 失败记录异常（不影响主流程）: {}", e.getMessage());
        }
    }

    // ==================== 辅助方法 ====================

    /** 计算参数哈希（SHA-256 前 16 位，避免 args 截断绕过） */
    public String hashParams(String args) {
        if (args == null || args.isBlank()) return "empty";
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(args.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return String.valueOf(args.hashCode());
        }
    }

    private String buildCircuitKey(Long tenantId, String toolName) {
        return CIRCUIT_KEY_PREFIX + tenantId + ":" + toolName;
    }

    private String buildFailCountKey(Long tenantId, String toolName) {
        return FAIL_COUNT_KEY_PREFIX + tenantId + ":" + toolName;
    }

    private String buildDupCacheKey(Long tenantId, String toolName, String paramsHash) {
        return DUP_CACHE_KEY_PREFIX + tenantId + ":" + toolName + ":" + paramsHash;
    }

    // ==================== D-021 合规可观测 ====================

    /** 获取成本防御统计指标（D-021 合规） */
    public Map<String, Object> getGuardStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", enabled);
        stats.put("redisAvailable", redis != null);
        stats.put("contextBloatDetectedCount", contextBloatDetectedCount.get());
        stats.put("circuitBreakerTrippedCount", circuitBreakerTrippedCount.get());
        stats.put("duplicateCacheHitCount", duplicateCacheHitCount.get());
        stats.put("duplicateCacheMissCount", duplicateCacheMissCount.get());
        long totalDup = duplicateCacheHitCount.get() + duplicateCacheMissCount.get();
        stats.put("duplicateCacheHitRate", totalDup > 0
                ? String.format("%.1f%%", 100.0 * duplicateCacheHitCount.get() / totalDup) : "N/A");
        stats.put("config", Map.of(
                "contextBloatThreshold", contextBloatThreshold,
                "contextHistoryLimit", contextHistoryLimit,
                "circuitBreakerThreshold", circuitBreakerThreshold,
                "circuitBreakerWindowMinutes", circuitBreakerWindowMinutes,
                "circuitBreakerRecoveryMinutes", circuitBreakerRecoveryMinutes,
                "duplicateCacheTtlHours", duplicateCacheTtlHours
        ));
        return stats;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isRedisAvailable() {
        return redis != null;
    }
}
