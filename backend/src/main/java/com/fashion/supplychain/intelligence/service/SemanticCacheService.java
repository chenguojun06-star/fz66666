package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.service.RedisService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * LLM 语义缓存服务
 *
 * <p>减少重复的 LLM 推理调用，节省 token 消耗。两层缓存策略：
 * <ol>
 *   <li>精确匹配：SHA-256(query) → Redis KV，O(1) 查询</li>
 *   <li>语义匹配：Qdrant 向量搜索，相似度 > threshold 时返回缓存响应</li>
 * </ol>
 *
 * <p>安全约束：
 * <ul>
 *   <li>多租户隔离：缓存 key 包含 tenantId</li>
 *   <li>静默降级：缓存查找/存储失败不影响主流程</li>
 *   <li>只缓存非空、长度 > 50 字符的响应（避免缓存简单问候语）</li>
 * </ul>
 */
@Service
@Lazy
@Slf4j
public class SemanticCacheService {

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired(required = false)
    private QdrantService qdrantService;

    @Value("${xiaoyun.semantic-cache.enabled:${XIAOYUN_SEMANTIC_CACHE_ENABLED:true}}")
    private boolean enabled;

    @Value("${xiaoyun.semantic-cache.ttl-minutes:${XIAOYUN_SEMANTIC_CACHE_TTL:30}}")
    private int cacheTtlMinutes;

    @Value("${xiaoyun.semantic-cache.similarity-threshold:${XIAOYUN_SEMANTIC_CACHE_THRESHOLD:0.86}}")
    private float similarityThreshold;

    private static final String CACHE_PREFIX = "semantic:llm:";
    /** Qdrant 中语义缓存的专用集合 */
    private static final String SEMANTIC_CACHE_COLLECTION = "semantic_cache";
    /** 最小缓存响应长度（低于此长度的响应不缓存，避免缓存简单问候语） */
    private static final int MIN_RESPONSE_LENGTH = 50;

    // ── 命中率监控计数器（线程安全） ──
    private final java.util.concurrent.atomic.AtomicLong totalLookups = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong exactHits = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong semanticHits = new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.concurrent.atomic.AtomicLong totalStores = new java.util.concurrent.atomic.AtomicLong(0);
    /** 统计重置时间戳，用于计算命中率的时间窗口 */
    private volatile long statsResetAt = System.currentTimeMillis();

    /**
     * 查找语义缓存的 LLM 响应
     *
     * @param tenantId 租户ID
     * @param query    用户查询
     * @return 缓存的响应，null 表示未命中
     */
    public String lookup(Long tenantId, String query) {
        if (!enabled || tenantId == null || query == null || query.isBlank()) {
            return null;
        }
        try {
            totalLookups.incrementAndGet();

            // 1. 精确匹配：SHA-256 查 Redis
            String exactKey = buildExactKey(tenantId, query);
            String cached = lookupExact(exactKey);
            if (cached != null) {
                exactHits.incrementAndGet();
                log.debug("[SemanticCache] 精确命中 tenantId={} queryLen={}", tenantId, query.length());
                return cached;
            }

            // 2. 语义匹配：Qdrant 搜索相似查询
            String semanticResult = lookupSemantic(tenantId, query);
            if (semanticResult != null) {
                semanticHits.incrementAndGet();
                log.info("[SemanticCache] 语义命中 tenantId={} queryLen={}", tenantId, query.length());
                return semanticResult;
            }

            return null;
        } catch (Exception e) {
            log.warn("[SemanticCache] lookup失败，静默降级 tenantId={}: {}", tenantId, e.getMessage());
            return null;
        }
    }

    /**
     * 存储 LLM 响应到语义缓存
     *
     * @param tenantId 租户ID
     * @param query    用户查询
     * @param response LLM 响应
     */
    public void store(Long tenantId, String query, String response) {
        if (!enabled || tenantId == null || query == null || query.isBlank()) {
            return;
        }
        // 只缓存非空、长度 > 50 字符的响应
        if (response == null || response.length() <= MIN_RESPONSE_LENGTH) {
            return;
        }
        try {
            totalStores.incrementAndGet();

            // 1. 精确缓存：Redis 存储 query_hash -> response
            String exactKey = buildExactKey(tenantId, query);
            storeExact(exactKey, response);

            // 2. 语义索引：Qdrant 存储 query_vector -> response（通过 payload）
            storeSemantic(tenantId, query, response);
        } catch (Exception e) {
            log.warn("[SemanticCache] store失败，静默降级 tenantId={}: {}", tenantId, e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  命中率监控与管理
    // ──────────────────────────────────────────────────────────────

    /**
     * 返回当前缓存统计快照（命中率、查询数等）
     */
    public CacheStats getStats() {
        long lookups = totalLookups.get();
        long exact = exactHits.get();
        long semantic = semanticHits.get();
        long hits = exact + semantic;
        double hitRate = lookups > 0 ? (hits * 100.0) / lookups : 0.0;
        double exactRate = lookups > 0 ? (exact * 100.0) / lookups : 0.0;
        double semanticRate = lookups > 0 ? (semantic * 100.0) / lookups : 0.0;
        long uptimeMinutes = Math.max(1, (System.currentTimeMillis() - statsResetAt) / 60000);
        return new CacheStats(enabled, lookups, hits, exact, semantic,
                totalStores.get(), hitRate, exactRate, semanticRate, uptimeMinutes,
                cacheTtlMinutes, similarityThreshold);
    }

    /**
     * 重置命中率计数器（用于A/B测试新缓存策略）
     */
    public void resetStats() {
        totalLookups.set(0);
        exactHits.set(0);
        semanticHits.set(0);
        totalStores.set(0);
        statsResetAt = System.currentTimeMillis();
        log.info("[SemanticCache] 命中率计数器已重置");
    }

    /**
     * 动态调整相似度阈值（运行时可调整，无需重启）
     */
    public void setSimilarityThreshold(float threshold) {
        if (threshold < 0.5f || threshold > 0.99f) {
            throw new IllegalArgumentException("相似度阈值必须在 0.5 ~ 0.99 之间");
        }
        this.similarityThreshold = threshold;
        log.info("[SemanticCache] 相似度阈值已调整为 {}", threshold);
    }

    /**
     * 缓存统计快照 DTO（内部类，便于 JSON 序列化）
     */
    public static class CacheStats {
        private final boolean enabled;
        private final long totalLookups;
        private final long totalHits;
        private final long exactHits;
        private final long semanticHits;
        private final long totalStores;
        private final double hitRatePercent;
        private final double exactRatePercent;
        private final double semanticRatePercent;
        private final long uptimeMinutes;
        private final int ttlMinutes;
        private final float similarityThreshold;

        public CacheStats(boolean enabled, long totalLookups, long totalHits,
                          long exactHits, long semanticHits, long totalStores,
                          double hitRatePercent, double exactRatePercent,
                          double semanticRatePercent, long uptimeMinutes,
                          int ttlMinutes, float similarityThreshold) {
            this.enabled = enabled;
            this.totalLookups = totalLookups;
            this.totalHits = totalHits;
            this.exactHits = exactHits;
            this.semanticHits = semanticHits;
            this.totalStores = totalStores;
            this.hitRatePercent = hitRatePercent;
            this.exactRatePercent = exactRatePercent;
            this.semanticRatePercent = semanticRatePercent;
            this.uptimeMinutes = uptimeMinutes;
            this.ttlMinutes = ttlMinutes;
            this.similarityThreshold = similarityThreshold;
        }

        public boolean isEnabled() { return enabled; }
        public long getTotalLookups() { return totalLookups; }
        public long getTotalHits() { return totalHits; }
        public long getExactHits() { return exactHits; }
        public long getSemanticHits() { return semanticHits; }
        public long getTotalStores() { return totalStores; }
        public double getHitRatePercent() { return Math.round(hitRatePercent * 100.0) / 100.0; }
        public double getExactRatePercent() { return Math.round(exactRatePercent * 100.0) / 100.0; }
        public double getSemanticRatePercent() { return Math.round(semanticRatePercent * 100.0) / 100.0; }
        public long getUptimeMinutes() { return uptimeMinutes; }
        public int getTtlMinutes() { return ttlMinutes; }
        public float getSimilarityThreshold() { return similarityThreshold; }
    }

    /**
     * 清除指定租户的语义缓存
     *
     * @param tenantId 租户ID
     */
    public void clearCache(Long tenantId) {
        if (tenantId == null) return;
        try {
            if (redisService != null) {
                String pattern = CACHE_PREFIX + tenantId + ":*";
                long deleted = redisService.deleteByPattern(pattern);
                log.info("[SemanticCache] 清除Redis缓存 tenantId={} deleted={}", tenantId, deleted);
            }
            if (qdrantService != null) {
                qdrantService.deleteVectorsByTenant(tenantId);
            }
        } catch (Exception e) {
            log.warn("[SemanticCache] clearCache失败 tenantId={}: {}", tenantId, e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  精确匹配（Redis）
    // ──────────────────────────────────────────────────────────────

    private String lookupExact(String key) {
        if (redisService == null) return null;
        try {
            return redisService.get(key);
        } catch (Exception e) {
            log.debug("[SemanticCache] Redis精确查找失败: {}", e.getMessage());
            return null;
        }
    }

    private void storeExact(String key, String response) {
        if (redisService == null) return;
        try {
            redisService.set(key, response, cacheTtlMinutes, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.debug("[SemanticCache] Redis精确存储失败: {}", e.getMessage());
        }
    }

    private String buildExactKey(Long tenantId, String query) {
        return CACHE_PREFIX + tenantId + ":" + sha256Hex(query);
    }

    // ──────────────────────────────────────────────────────────────
    //  语义匹配（Qdrant）
    // ──────────────────────────────────────────────────────────────

    private String lookupSemantic(Long tenantId, String query) {
        if (qdrantService == null) return null;
        try {
            List<QdrantService.ScoredPoint> results =
                    qdrantService.search(tenantId, query, 1);
            if (results == null || results.isEmpty()) return null;

            QdrantService.ScoredPoint top = results.get(0);
            if (top.getScore() >= similarityThreshold) {
                String response = top.getPayload() != null
                        ? top.getPayload().get("response") : null;
                if (response != null && !response.isBlank()) {
                    return response;
                }
            }
        } catch (Exception e) {
            log.debug("[SemanticCache] Qdrant语义查找失败: {}", e.getMessage());
        }
        return null;
    }

    private void storeSemantic(Long tenantId, String query, String response) {
        if (qdrantService == null) return;
        try {
            String pointId = "sc:" + tenantId + ":" + sha256Hex(query);
            java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("query", truncate(query, 500));
            payload.put("response", truncate(response, 4000));
            payload.put("type", "semantic_cache");
            payload.put("ttl_minutes", cacheTtlMinutes);
            payload.put("created_at", System.currentTimeMillis());

            qdrantService.upsertVector(pointId, tenantId, query, payload);
        } catch (Exception e) {
            log.debug("[SemanticCache] Qdrant语义存储失败: {}", e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  工具方法
    // ──────────────────────────────────────────────────────────────

    private String sha256Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(text.hashCode());
        }
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) : text;
    }
}
