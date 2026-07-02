package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentToolDef;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 工具结果缓存服务 — 跨会话缓存只读工具的查询结果。
 *
 * <h3>安全设计：</h3>
 * <ul>
 *   <li>只缓存 readOnly=true 的工具，写操作绝不缓存</li>
 *   <li>TTL 很短（默认5分钟），避免数据过时</li>
 *   <li>配合现有会话内 toolResultCache（会话内优先，跨会话兜底）</li>
 *   <li>可配置开关（xiaoyun.tool-cache.enabled），随时可关闭</li>
 *   <li>缓存 key 使用 SHA-256 hash，避免敏感参数泄露</li>
 * </ul>
 *
 * <h3>使用场景：</h3>
 * <ul>
 *   <li>频繁查询同一订单详情（order_detail_tool）</li>
 *   <li>频繁查询工厂产能（factory_capacity_tool）</li>
 *   <li>频繁查询款式信息（style_info_tool）</li>
 * </ul>
 *
 * <p>参考 GitHub 2026 最佳实践：LangChain Tool Cache + OpenAI Function Cache。
 */
@Slf4j
@Service
@Lazy
public class ToolResultCacheService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String KEY_PREFIX = "ai:tool-cache:";
    private static final Duration DEFAULT_TTL = Duration.ofMinutes(5);

    @Autowired(required = false)
    private StringRedisTemplate redis;

    @Value("${xiaoyun.tool-cache.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.tool-cache.ttl-minutes:5}")
    private int ttlMinutes;

    /** 本地统计（进程内） */
    private final AtomicLong totalLookups = new AtomicLong();
    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();

    /** 本地缓存（进程内 L1，减少 Redis 调用） */
    private final Map<String, CacheEntry> localCache = new ConcurrentHashMap<>();
    private static final int LOCAL_CACHE_MAX_SIZE = 200;

    /**
     * 查询缓存。
     *
     * @param tool 工具实例
     * @param toolName 工具名称
     * @param argsJson 参数JSON
     * @return 缓存的结果，或 null（未命中/不可缓存）
     */
    public String lookup(AgentTool tool, String toolName, String argsJson) {
        if (!enabled || redis == null) {
            return null;
        }

        // 安全检查：只缓存只读工具
        if (!isReadOnlyTool(tool)) {
            return null;
        }

        totalLookups.incrementAndGet();

        String cacheKey = buildCacheKey(toolName, argsJson);

        // L1: 本地缓存优先
        CacheEntry localEntry = localCache.get(cacheKey);
        if (localEntry != null && !localEntry.isExpired()) {
            hits.incrementAndGet();
            log.debug("[ToolCache] L1命中: tool={}, key={}", toolName, cacheKey);
            return localEntry.result;
        }

        // L2: Redis 缓存
        try {
            String cached = redis.opsForValue().get(KEY_PREFIX + cacheKey);
            if (cached != null && !cached.isEmpty()) {
                hits.incrementAndGet();
                // 回填 L1
                localCache.put(cacheKey, new CacheEntry(cached, System.currentTimeMillis() + ttlMinutes * 60 * 1000));
                pruneLocalCacheIfNeeded();
                log.debug("[ToolCache] L2命中: tool={}, key={}", toolName, cacheKey);
                return cached;
            }
        } catch (Exception e) {
            log.warn("[ToolCache] Redis查询异常，降级为miss: {}", e.getMessage());
        }

        misses.incrementAndGet();
        return null;
    }

    /**
     * 保存缓存。
     *
     * @param tool 工具实例
     * @param toolName 工具名称
     * @param argsJson 参数JSON
     * @param result 执行结果
     */
    public void save(AgentTool tool, String toolName, String argsJson, String result) {
        if (!enabled || redis == null || result == null || result.isEmpty()) {
            return;
        }

        // 安全检查：只缓存只读工具
        if (!isReadOnlyTool(tool)) {
            return;
        }

        // 安全检查：不缓存错误结果
        if (isErrorResult(result)) {
            return;
        }

        String cacheKey = buildCacheKey(toolName, argsJson);
        Duration ttl = Duration.ofMinutes(ttlMinutes);

        try {
            // L1: 本地缓存
            localCache.put(cacheKey, new CacheEntry(result, System.currentTimeMillis() + ttl.toMillis()));
            pruneLocalCacheIfNeeded();

            // L2: Redis 缓存（异步，不阻塞主流程）
            redis.opsForValue().set(KEY_PREFIX + cacheKey, result, ttl);
            log.debug("[ToolCache] 已缓存: tool={}, ttl={}min", toolName, ttlMinutes);
        } catch (Exception e) {
            log.warn("[ToolCache] Redis保存异常，静默降级: {}", e.getMessage());
        }
    }

    /**
     * 判断工具是否只读（安全缓存的前提）。
     */
    private boolean isReadOnlyTool(AgentTool tool) {
        if (tool == null) {
            return false;
        }
        // 检查 @AgentToolDef 注解
        AgentToolDef def = tool.getClass().getAnnotation(AgentToolDef.class);
        if (def != null) {
            return def.readOnly();
        }
        // 没有注解的默认为只读（保守策略）
        return true;
    }

    /**
     * 判断结果是否为错误（不缓存错误）。
     */
    private boolean isErrorResult(String result) {
        if (result == null || result.length() < 10) {
            return false;
        }
        String lower = result.toLowerCase();
        return lower.contains("\"error\"") ||
               lower.contains("\"exception\"") ||
               lower.contains("\"failed\"") ||
               lower.contains("\"timeout\"") ||
               lower.contains("未知工具") ||
               lower.contains("无权使用");
    }

    /**
     * 构建缓存 key（SHA-256 hash，避免敏感参数泄露）。
     */
    private String buildCacheKey(String toolName, String argsJson) {
        try {
            String rawKey = toolName + ":" + (argsJson != null ? argsJson : "{}");
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(rawKey.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return toolName + ":" + sb.substring(0, 16); // 取前16位，足够唯一
        } catch (Exception e) {
            // 降级：直接用原字符串
            return toolName + ":" + (argsJson != null ? argsJson.hashCode() : 0);
        }
    }

    /**
     * 清理本地缓存（超出上限时）。
     */
    private void pruneLocalCacheIfNeeded() {
        if (localCache.size() > LOCAL_CACHE_MAX_SIZE) {
            // 简单策略：清除一半（最老的）
            int toRemove = LOCAL_CACHE_MAX_SIZE / 2;
            localCache.entrySet().stream()
                    .sorted((a, b) -> Long.compare(a.getValue().expireTime, b.getValue().expireTime))
                    .limit(toRemove)
                    .forEach(e -> localCache.remove(e.getKey()));
            log.debug("[ToolCache] 本地缓存已清理: removed={}", toRemove);
        }
    }

    /**
     * 获取缓存统计。
     */
    public CacheStats getStats() {
        long lookups = totalLookups.get();
        long h = hits.get();
        double hitRate = lookups > 0 ? (h * 100.0) / lookups : 0.0;
        return new CacheStats(enabled, lookups, h, misses.get(), hitRate, localCache.size());
    }

    /**
     * 清除所有缓存（配置变更时）。
     */
    public void clearAll() {
        localCache.clear();
        if (redis != null) {
            try {
                var keys = redis.keys(KEY_PREFIX + "*");
                if (keys != null && !keys.isEmpty()) {
                    redis.delete(keys);
                    log.info("[ToolCache] Redis缓存已清除: count={}", keys.size());
                }
            } catch (Exception e) {
                log.warn("[ToolCache] Redis清除异常: {}", e.getMessage());
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    // 内部数据结构

    private static class CacheEntry {
        final String result;
        final long expireTime;

        CacheEntry(String result, long expireTime) {
            this.result = result;
            this.expireTime = expireTime;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireTime;
        }
    }

    public static class CacheStats {
        public final boolean enabled;
        public final long totalLookups;
        public final long hits;
        public final long misses;
        public final double hitRate;
        public final int localCacheSize;

        public CacheStats(boolean enabled, long totalLookups, long hits, long misses,
                          double hitRate, int localCacheSize) {
            this.enabled = enabled;
            this.totalLookups = totalLookups;
            this.hits = hits;
            this.misses = misses;
            this.hitRate = hitRate;
            this.localCacheSize = localCacheSize;
        }
    }
}