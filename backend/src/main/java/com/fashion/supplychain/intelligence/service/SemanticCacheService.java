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

    @Value("${xiaoyun.semantic-cache.ttl-minutes:${XIAOYUN_SEMANTIC_CACHE_TTL:120}}")
    private int cacheTtlMinutes;

    /** 简单查询（问候/帮助）TTL，分钟 */
    @Value("${xiaoyun.semantic-cache.ttl-simple-minutes:30}")
    private int simpleCacheTtlMinutes;

    /** 事实查询（订单/库存/进度）TTL，分钟 */
    @Value("${xiaoyun.semantic-cache.ttl-fact-minutes:60}")
    private int factCacheTtlMinutes;

    /** 知识查询（工艺/面料/流程解释）TTL，分钟 */
    @Value("${xiaoyun.semantic-cache.ttl-knowledge-minutes:720}")
    private int knowledgeCacheTtlMinutes;

    @Value("${xiaoyun.semantic-cache.similarity-threshold:${XIAOYUN_SEMANTIC_CACHE_THRESHOLD:0.80}}")
    private float similarityThreshold;

    @Value("${xiaoyun.semantic-cache.min-response-length:50}")
    private int minResponseLength;

    private static final String CACHE_PREFIX = "semantic:llm:";

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

            String normalizedQuery = normalizeQuery(query);

            // 1. 精确匹配：SHA-256 查 Redis
            String exactKey = buildExactKey(tenantId, normalizedQuery);
            String cached = lookupExact(exactKey);
            if (cached != null) {
                exactHits.incrementAndGet();
                log.debug("[SemanticCache] 精确命中 tenantId={} queryLen={}", tenantId, query.length());
                return cached;
            }

            // 2. 语义匹配：Qdrant 搜索相似查询（使用原始query，语义匹配更准确）
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
        if (response == null || response.length() <= minResponseLength) {
            return;
        }
        try {
            totalStores.incrementAndGet();

            String normalizedQuery = normalizeQuery(query);

            // 1. 精确缓存：Redis 存储 query_hash -> response（用规范化query）
            String exactKey = buildExactKey(tenantId, normalizedQuery);
            int ttl = resolveTtlMinutes(query, response);
            storeExact(exactKey, response, ttl);

            // 2. 语义索引：Qdrant 存储 query_vector -> response（通过 payload，用原始query）
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

    private void storeExact(String key, String response, int ttlMinutes) {
        if (redisService == null) return;
        try {
            redisService.set(key, response, ttlMinutes, TimeUnit.MINUTES);
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

    /**
     * 规范化查询字符串，提高精确缓存命中率
     * - 去除首尾空白
     * - 合并多个空白字符为单个空格
     * - 转小写
     * - 服装术语归一化（同义词统一，提高命中率）
     */
    private String normalizeQuery(String query) {
        if (query == null) return null;
        String normalized = query.trim()
                .replaceAll("\\s+", " ")
                .toLowerCase();
        return normalizeFashionTerms(normalized);
    }

    /**
     * 服装行业术语归一化。
     * 将用户常用的口语/同义词统一为标准形式，提高语义缓存精确命中率。
     */
    private String normalizeFashionTerms(String query) {
        if (query == null) return null;
        String result = query;
        // 颜色归一化
        result = result.replace("粉红", "粉色");
        result = result.replace("玫红", "玫瑰红");
        result = result.replace("卡其色", "卡其");
        result = result.replace("藏青色", "藏青");
        // 尺码归一化
        result = result.replace("加大码", "xl");
        result = result.replace("加小码", "xs");
        result = result.replace("均码", "onesize");
        // 生产环节归一化
        result = result.replace("打样", "打版");
        result = result.replace("做大货", "生产");
        result = result.replace("做大货单", "生产");
        result = result.replace("出货", "发货");
        result = result.replace("出貨", "发货");
        // 工艺归一化
        result = result.replace("印花", "印花工艺");
        result = result.replace("绣花", "绣花工艺");
        result = result.replace("提花", "提花工艺");
        // 部门/角色
        result = result.replace("厂长", "工厂负责人");
        result = result.replace("老板", "管理员");
        // 常见口语
        result = result.replace("多少了", "进度");
        result = result.replace("怎么样了", "进度");
        result = result.replace("啥情况", "状态");
        result = result.replace("好了没", "完成状态");
        return result;
    }

    /**
     * 根据查询类型动态选择 TTL。
     * 简单问候 → 短 TTL；事实查询 → 中 TTL；知识查询 → 长 TTL。
     */
    private int resolveTtlMinutes(String query, String response) {
        if (query == null) return cacheTtlMinutes;
        String q = query.toLowerCase();
        // 知识类查询（工艺/面料/流程解释）→ 长 TTL，答案稳定
        if (q.contains("什么是") || q.contains("怎么") || q.contains("如何") || q.contains("工艺")
                || q.contains("面料") || q.contains("流程") || q.contains("区别")) {
            return knowledgeCacheTtlMinutes;
        }
        // 事实类查询（订单/库存/进度/工资）→ 中 TTL，数据会变化
        if (q.contains("订单") || q.contains("库存") || q.contains("进度") || q.contains("工资")
                || q.contains("数量") || q.contains("状态") || q.contains("多少")) {
            return factCacheTtlMinutes;
        }
        // 简单查询（问候/帮助）→ 短 TTL
        if (q.length() < 15 || q.contains("你好") || q.contains("帮助") || q.contains("功能")) {
            return simpleCacheTtlMinutes;
        }
        return cacheTtlMinutes;
    }
}
