package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.security.MessageDigest;
import java.util.stream.Collectors;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.context.annotation.Lazy;

/**
 * Qdrant 向量库接入服务
 *
 * <p>通过 Qdrant REST API v1.x 实现向量存储与相似检索。
 * 每个租户使用同一个 collection，通过 tenant_id payload 过滤隔离。
 *
 * <p>向量生成优先级：① Agnes 视觉分析 + Agnes/DeepSeek Embedding（图片→文字描述→向量，推荐）
 *                   ② DeepSeek Embedding API（text-embedding-v2，用图片URL文本生成向量）
 *                   ③ 关键词哈希伪向量（pseudoEmbedding，128维，无需 API Key）
 *
 * <p>配置项（application.yml）：
 * <pre>
 * intelligence:
 *   qdrant:
 *     url: http://localhost:6333
 *     collection: fashion_memory
 *     vector-size: 1024
 * ai:
 *   agnes:
 *     api-key: ${AGNES_API_KEY:}   # Agnes AI 视觉+Embedding
 *     model: agnes-2.0-flash
 *   deepseek:
 *     api-key: sk-xxx
 *     embedding-model: text-embedding-v2
 * </pre>
 */
@Service
@Lazy
@Slf4j
public class QdrantService {

    private static final String COLLECTION_DEFAULT = "fashion_memory";
    private static final int VECTOR_DIM_REAL = 1024;
    private static final int VECTOR_DIM_PSEUDO = 128;
    /** 款式图片单独集合，与文字记忆集合分离 */
    private static final String STYLE_IMAGE_COLLECTION = "style_images";
    /** 稀疏向量名称，与 Qdrant 集合的 sparse_vectors 配置对应 */
    private static final String SPARSE_VECTOR_NAME = "text-sparse";

    @Value("${intelligence.qdrant.url:http://localhost:6333}")
    private String qdrantUrl;

    @Value("${intelligence.qdrant.collection:" + COLLECTION_DEFAULT + "}")
    private String collectionName;

    @Value("${ai.deepseek.api-key:}")
    private String deepseekApiKey;

    @Value("${ai.deepseek.embedding-model:text-embedding-v2}")
    private String embeddingModel;

    @Value("${ai.deepseek.base-url:https://api.deepseek.com}")
    private String deepseekBaseUrl;

    @Value("${intelligence.qdrant.enabled:false}")
    private boolean qdrantEnabled;

    @Value("${intelligence.qdrant.timeout-seconds:10}")
    private int qdrantTimeoutSeconds;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${ai.agnes.api-key:}")
    private String agnesApiKey;

    @Value("${ai.agnes.api-url:https://apihub.agnes-ai.com/v1/chat/completions}")
    private String agnesApiUrl;

    @Value("${ai.agnes.model:agnes-2.0-flash}")
    private String agnesModel;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private RestTemplate restTemplate;

    private final ConcurrentHashMap<String, EmbeddingCacheEntry> embeddingCache = new ConcurrentHashMap<>();
    private static final long EMBEDDING_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(30);
    private static final int EMBEDDING_CACHE_MAX = 500;
    private static final String PROVIDER_DEEPSEEK = "deepseek";
    private static final String PROVIDER_AGNES = "agnes";

    private final AtomicBoolean collectionVerified = new AtomicBoolean(false);
    private final AtomicBoolean styleImageCollectionVerified = new AtomicBoolean(false);
    /** 混合检索降级标记：true 表示 Qdrant 不支持混合检索，后续直接走纯稠密检索 */
    private final AtomicBoolean hybridSearchDegraded = new AtomicBoolean(false);

    private static class EmbeddingCacheEntry {
        final float[] vector;
        final String provider;
        final long createdAt;
        EmbeddingCacheEntry(float[] vector, String provider) {
            this.vector = vector;
            this.provider = provider;
            this.createdAt = System.currentTimeMillis();
        }
        boolean isExpired() { return System.currentTimeMillis() - createdAt > EMBEDDING_CACHE_TTL_MS; }
    }

    private String sha256Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(text.hashCode());
        }
    }

    @PostConstruct
    void initRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) TimeUnit.SECONDS.toMillis(Math.max(qdrantTimeoutSeconds, 5)));
        factory.setReadTimeout((int) TimeUnit.SECONDS.toMillis(qdrantTimeoutSeconds));
        this.restTemplate = new RestTemplate(factory);
    }

    /** F4: 启动时校验 Qdrant 集合向量维度是否与当前配置一致 */
    @PostConstruct
    void validateCollectionDimension() {
        if (!qdrantEnabled) {
            log.info("[Qdrant] 已禁用（intelligence.qdrant.enabled=false），跳过向量库初始化。如需要启用请配置 QDRANT_URL 并设 intelligence.qdrant.enabled=true");
            return;
        }
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                JsonNode root = objectMapper.readTree(resp.getBody());
                long storedDim = root.path("result").path("config")
                        .path("params").path("vectors").path("size").asLong(-1);
                int expectedDim = getVectorDim();
                if (storedDim > 0 && storedDim != expectedDim) {
                    // 【P1-7修复】原 log.error 在"无 API Key 走 pseudoEmbedding(128维)"场景下产生大量 ERROR 噪音
                    // 改为 log.warn：仍保留问题可见性，但不污染 ERROR 级别日志（真正的服务错误才用 ERROR）
                    // 同时补充降级提示：若使用 pseudoEmbedding 属于配置降级，非故障
                    log.warn("[Qdrant] 向量维度不匹配（可能为 pseudoEmbedding 降级模式）集合={} 存储维度={} 当前配置维度={}"
                            + " — 搜索结果可能不可靠，请重建集合或调整 API Key 配置",
                            collectionName, storedDim, expectedDim);
                } else if (storedDim > 0) {
                    log.info("[Qdrant] 集合 {} 维度校验通过 dim={}", collectionName, storedDim);
                }
            }
        } catch (Exception e) {
            log.debug("[Qdrant] 启动维度校验跳过（Qdrant不可用）: {}", e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  公开接口
    // ──────────────────────────────────────────────────────────────

    /**
     * 向量化存储一条记忆。
     *
     * @param pointId  唯一ID（使用 t_intelligence_memory.id 转字符串）
     * @param tenantId 租户ID（用于 payload 过滤）
     * @param content  记忆文本（用于生成伪向量）
     * @param payload  附加元数据（title/type/domain 等）
     * @return 是否成功
     */
    public boolean upsertVector(String pointId, Long tenantId, String content,
            java.util.Map<String, Object> payload) {
        if (!qdrantEnabled) return false;
        if (tenantId == null) {
            log.warn("[Qdrant] upsert拒绝：tenantId为null，禁止写入孤儿向量 pointId={}", pointId);
            return false;
        }
        try {
            ensureCollectionExists();
            float[] vector = computeEmbedding(content);
            if (vector == null) {
                log.warn("[Qdrant] upsert跳过：内容为空无法生成向量 pointId={}", pointId);
                return false;
            }

            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            ObjectNode point = points.addObject();
            point.put("id", pointId);

            ArrayNode vec = point.putArray("vector");
            for (float v : vector) {
                vec.add(v);
            }

            ObjectNode payloadNode = point.putObject("payload");
            payloadNode.put("tenant_id", tenantId);
            if (payload != null) {
                payload.forEach((k, v) -> payloadNode.put(k, String.valueOf(v)));
            }

            String url = qdrantUrl + "/collections/" + collectionName + "/points";
            HttpEntity<String> entity = jsonEntity(body.toString());
            ResponseEntity<String> resp = restTemplate.exchange(url,
                    HttpMethod.PUT, entity, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.warn("[Qdrant] upsert失败 pointId={}: {}", pointId, e.getMessage());
            return false;
        }
    }

    /**
     * 按文本内容搜索相似记忆（限同租户）。
     *
     * @param tenantId  租户ID
     * @param queryText 查询文本
     * @param topK      返回条数
     * @return 匹配点的 pointId 列表（按相似度降序）
     */
    public List<ScoredPoint> search(Long tenantId, String queryText, int topK) {
        if (!qdrantEnabled) return Collections.emptyList();
        List<ScoredPoint> results = new ArrayList<>();
        try {
            float[] vector = computeEmbedding(queryText);
            if (vector == null) {
                log.warn("[Qdrant] search跳过：查询文本为空无法生成向量");
                return results;
            }

            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode vec = body.putArray("vector");
            for (float v : vector) {
                vec.add(v);
            }
            body.put("limit", topK);
            body.put("with_payload", true);
            // F26: 过滤低质量匹配，余弦相似度 < 0.3 的结果直接丢弃
            body.put("score_threshold", 0.3);

            // 租户隔离过滤（tenantId 为 null 时拒绝搜索，防止跨租户数据泄漏）
            if (tenantId == null) {
                log.warn("[Qdrant] search拒绝: tenantId为null，跳过搜索以防止跨租户数据泄漏");
                return results;
            }
            ObjectNode filter = body.putObject("filter");
            ArrayNode should = filter.putArray("should");

            ObjectNode tenantCond = should.addObject();
            tenantCond.put("key", "tenant_id");
            ObjectNode tenantMatchVal = tenantCond.putObject("match");
            tenantMatchVal.put("integer", tenantId);

            ObjectNode publicCond = should.addObject();
            publicCond.put("key", "tenant_id");
            ObjectNode publicMatchVal = publicCond.putObject("match");
            publicMatchVal.put("integer", 0);

            String url = qdrantUrl + "/collections/" + collectionName + "/points/search";
            HttpEntity<String> entity = jsonEntity(body.toString());
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);

            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                JsonNode root = objectMapper.readTree(resp.getBody());
                JsonNode resultNode = root.path("result");
                if (resultNode.isArray()) {
                    for (JsonNode item : resultNode) {
                        ScoredPoint sp = new ScoredPoint();
                        sp.setPointId(item.path("id").asText());
                        sp.setScore((float) item.path("score").asDouble());
                        sp.setPayload(readPayload(item.path("payload")));
                        results.add(sp);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Qdrant] search失败 tenantId={}: {}", tenantId, e.getMessage());
        }
        return results;
    }

    private Map<String, String> readPayload(JsonNode payloadNode) {
        if (payloadNode == null || payloadNode.isMissingNode() || payloadNode.isNull()) {
            return Collections.emptyMap();
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payloadNode.fields().forEachRemaining(entry -> payload.put(entry.getKey(), entry.getValue().asText("")));
        return payload;
    }

    // ──────────────────────────────────────────────────────────────
    //  混合检索（稀疏+稠密）
    // ──────────────────────────────────────────────────────────────

    /**
     * 混合检索：同时执行稠密向量检索和稀疏关键词检索，合并结果按综合分数排序。
     *
     * <p>使用 Qdrant 的 /points/query 端点，支持稀疏+稠密混合检索。
     * 如果 Qdrant 不支持混合检索（旧版本），自动降级到纯稠密检索。
     *
     * @param tenantId  租户ID（必须非null，否则拒绝搜索）
     * @param queryText 查询文本
     * @param topK      返回条数
     * @return 匹配点列表（按综合分数降序）
     */
    public List<ScoredPoint> hybridSearch(Long tenantId, String queryText, int topK) {
        if (!qdrantEnabled) return new ArrayList<>();
        if (tenantId == null) {
            log.warn("[Qdrant] hybridSearch拒绝: tenantId为null，跳过搜索以防止跨租户数据泄漏");
            return new ArrayList<>();
        }

        // 如果已确认不支持混合检索，直接降级
        if (hybridSearchDegraded.get()) {
            log.debug("[Qdrant] hybridSearch降级: Qdrant不支持混合检索，走纯稠密检索");
            return search(tenantId, queryText, topK);
        }

        try {
            ensureCollectionExists();

            // 1. 生成稠密向量
            float[] denseVector = computeEmbedding(queryText);
            if (denseVector == null) {
                log.warn("[Qdrant] hybridSearch跳过：查询文本为空无法生成向量");
                return new ArrayList<>();
            }

            // 2. 生成稀疏向量
            SparseVector sparseVector = computeSparseVector(queryText);

            // 3. 构造 /points/query 请求体
            ObjectNode body = objectMapper.createObjectNode();

            // 稠密向量
            ArrayNode queryArr = body.putArray("query");
            for (float v : denseVector) {
                queryArr.add(v);
            }

            // 稀疏向量
            if (sparseVector != null && !sparseVector.indices.isEmpty()) {
                ObjectNode sparseNode = body.putObject("sparse_vector");
                ArrayNode indicesArr = sparseNode.putArray("indices");
                ArrayNode valuesArr = sparseNode.putArray("values");
                for (int i = 0; i < sparseVector.indices.size(); i++) {
                    indicesArr.add(sparseVector.indices.get(i));
                    valuesArr.add(sparseVector.values.get(i));
                }
            }

            body.put("limit", topK);
            body.put("with_payload", true);
            body.put("score_threshold", 0.3);

            // 租户隔离过滤
            ObjectNode filter = body.putObject("filter");
            ArrayNode should = filter.putArray("should");

            ObjectNode tenantCond = should.addObject();
            tenantCond.put("key", "tenant_id");
            ObjectNode tenantMatchVal = tenantCond.putObject("match");
            tenantMatchVal.put("integer", tenantId);

            ObjectNode publicCond = should.addObject();
            publicCond.put("key", "tenant_id");
            ObjectNode publicMatchVal = publicCond.putObject("match");
            publicMatchVal.put("integer", 0);

            // 4. 调用 /points/query 端点
            String url = qdrantUrl + "/collections/" + collectionName + "/points/query";
            HttpEntity<String> entity = jsonEntity(body.toString());
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);

            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                List<ScoredPoint> results = new ArrayList<>();
                JsonNode root = objectMapper.readTree(resp.getBody());
                JsonNode resultNode = root.path("result");
                if (resultNode.isArray()) {
                    for (JsonNode item : resultNode) {
                        ScoredPoint sp = new ScoredPoint();
                        sp.setPointId(item.path("id").asText());
                        sp.setScore((float) item.path("score").asDouble());
                        sp.setPayload(readPayload(item.path("payload")));
                        results.add(sp);
                    }
                }
                log.debug("[Qdrant] hybridSearch成功 tenantId={} 结果数={}", tenantId, results.size());
                return results;
            }
        } catch (Exception e) {
            String msg = e.getMessage();
            // 判断是否为不支持混合检索的错误
            if (msg != null && (msg.contains("sparse") || msg.contains("not found")
                    || msg.contains("not supported") || msg.contains("404")
                    || msg.contains("No sparse vector"))) {
                log.warn("[Qdrant] hybridSearch降级: Qdrant不支持混合检索，后续将走纯稠密检索 - {}", msg);
                hybridSearchDegraded.set(true);
                return search(tenantId, queryText, topK);
            }
            log.warn("[Qdrant] hybridSearch失败 tenantId={}: {}，降级到纯稠密检索", tenantId, msg);
        }

        // 降级到纯稠密检索
        return search(tenantId, queryText, topK);
    }

    /**
     * 检查混合检索是否可用（供外部判断是否使用混合检索）。
     */
    public boolean isHybridSearchAvailable() {
        return !hybridSearchDegraded.get();
    }

    /**
     * 稀疏向量内部表示
     */
    private static class SparseVector {
        final List<Integer> indices = new ArrayList<>();
        final List<Float> values = new ArrayList<>();
    }

    /**
     * BM25风格稀疏向量生成：对查询文本分词，生成 token-id:tf 键值对。
     *
     * <p>分词策略：中文按双字符滑动窗口 + 单字符，英文按空格分词。
     * token-id 通过字符串哈希映射到正整数空间。
     * tf（词频）归一化到 [0, 1] 区间。
     */
    private SparseVector computeSparseVector(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            // 分词：中文双字符窗口 + 单字符 + 英文单词
            Map<String, Integer> termFreq = new HashMap<>();
            String trimmed = text.trim();

            // 英文分词（按空格/标点分割）
            String[] words = trimmed.split("[\\s,，。.!！?？;；:：、/\\\\()（）\\[\\]【】{}]+");
            for (String word : words) {
                if (word.isEmpty()) continue;
                String lower = word.toLowerCase();
                termFreq.merge(lower, 1, Integer::sum);
            }

            // 中文双字符滑动窗口（bigram）
            for (int i = 0; i < trimmed.length() - 1; i++) {
                char c1 = trimmed.charAt(i);
                char c2 = trimmed.charAt(i + 1);
                if (isChineseChar(c1) && isChineseChar(c2)) {
                    String bigram = "" + c1 + c2;
                    termFreq.merge(bigram, 1, Integer::sum);
                }
            }

            // 中文单字符（仅对高频字单独建索引）
            for (int i = 0; i < trimmed.length(); i++) {
                char c = trimmed.charAt(i);
                if (isChineseChar(c)) {
                    String single = String.valueOf(c);
                    termFreq.merge(single, 1, Integer::sum);
                }
            }

            if (termFreq.isEmpty()) return null;

            // 找最大词频用于归一化
            int maxFreq = termFreq.values().stream().mapToInt(Integer::intValue).max().orElse(1);

            // 构建 SparseVector
            SparseVector sv = new SparseVector();
            for (Map.Entry<String, Integer> entry : termFreq.entrySet()) {
                int tokenId = Math.abs(entry.getKey().hashCode()) % 100000 + 1;
                float tf = (float) entry.getValue() / maxFreq;
                sv.indices.add(tokenId);
                sv.values.add(tf);
            }
            return sv;
        } catch (Exception e) {
            log.debug("[Qdrant] 稀疏向量生成失败: {}", e.getMessage());
            return null;
        }
    }

    private boolean isChineseChar(char c) {
        return c >= '\u4e00' && c <= '\u9fff';
    }

    /** 删除指定向量点（需提供 tenantId 校验归属，tenantId 为 null 时拒绝删除） */
    public void deleteVector(String pointId, Long tenantId) {
        if (tenantId == null) {
            log.warn("[Qdrant] delete拒绝: tenantId为null，拒绝删除以防止跨租户数据操作 pointId={}", pointId);
            return;
        }
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode filter = body.putObject("filter");
            ArrayNode must = filter.putArray("must");
            ObjectNode idCond = must.addObject();
            idCond.put("key", "id");
            idCond.putObject("match").put("value", pointId);
            ObjectNode tenantCond = must.addObject();
            tenantCond.put("key", "tenant_id");
            tenantCond.putObject("match").put("integer", tenantId);

            String url = qdrantUrl + "/collections/" + collectionName + "/points/delete";
            restTemplate.exchange(url, HttpMethod.POST, jsonEntity(body.toString()), String.class);
        } catch (Exception e) {
            log.warn("[Qdrant] delete失败 pointId={}: {}", pointId, e.getMessage());
        }
    }

    private final java.util.concurrent.atomic.AtomicLong lastHealthCheckTime = new java.util.concurrent.atomic.AtomicLong(0);
    private volatile boolean lastHealthStatus = false;
    private static final long HEALTH_CHECK_CACHE_MS = 30_000L;

    public boolean isAvailable() {
        if (!qdrantEnabled) return false;
        long now = System.currentTimeMillis();
        long last = lastHealthCheckTime.get();
        if (now - last < HEALTH_CHECK_CACHE_MS) {
            return lastHealthStatus;
        }
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                    qdrantUrl + "/healthz", String.class);
            boolean ok = resp.getStatusCode().is2xxSuccessful();
            lastHealthStatus = ok;
            lastHealthCheckTime.set(now);
            return ok;
        } catch (Exception e) {
            lastHealthStatus = false;
            lastHealthCheckTime.set(now);
            return false;
        }
    }

    /**
     * 确保集合存在（公开管理入口，供 QdrantAdminOrchestrator 在启动时调用）。
     * @return true=新建了集合；false=集合已存在或 Qdrant 不可用
     */
    public boolean ensureCollection() {
        if (!qdrantEnabled) return false;
        try {
            restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
            return false; // 已存在
        } catch (Exception e) {
            // 不存在，创建
            ensureCollectionExists();
            return true;
        }
    }

    /**
     * 查询集合中向量总数（Admin 统计用）。
     * @return 向量点数；-1 表示查询失败或 Qdrant 不可用
     */
    public long countVectors() {
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) return -1;
            JsonNode root = objectMapper.readTree(resp.getBody());
            return root.path("result").path("vectors_count").asLong(-1);
        } catch (Exception e) {
            return -1;
        }
    }

    /**
     * 按租户 ID 批量删除向量（清理离职租户或冷数据）。
     * 使用 Qdrant Payload Filter 删除；单次最多清理 10000 条。
     * @return 实际删除条数（Qdrant 返回 operation_id，无法精确计数时返回 0）
     */
    public int deleteVectorsByTenant(Long tenantId) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode filter = body.putObject("filter");
            ArrayNode must = filter.putArray("must");
            ObjectNode cond = must.addObject();
            cond.put("key", "tenant_id");
            cond.putObject("match").put("integer", tenantId);

            String url = qdrantUrl + "/collections/" + collectionName + "/points/delete";
            restTemplate.exchange(url, HttpMethod.POST, jsonEntity(body.toString()), String.class);
            log.info("[Qdrant] 已触发租户向量删除 tenantId={}", tenantId);
            return 0; // Qdrant filter-delete 不返回精确条数
        } catch (Exception e) {
            log.warn("[Qdrant] 租户向量删除失败 tenantId={}: {}", tenantId, e.getMessage());
            return -1;
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  内部工具
    // ──────────────────────────────────────────────────────────────

    private void ensureCollectionExists() {
        if (collectionVerified.get()) return;
        try {
            restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
            collectionVerified.set(true);
        } catch (Exception e) {
            try {
                ObjectNode body = objectMapper.createObjectNode();
                ObjectNode params = body.putObject("vectors");
                params.put("size", getVectorDim());
                params.put("distance", "Cosine");
                // 添加稀疏向量支持
                ObjectNode sparseVectors = body.putObject("sparse_vectors");
                sparseVectors.putObject(SPARSE_VECTOR_NAME);
                restTemplate.postForEntity(
                        qdrantUrl + "/collections/" + collectionName,
                        jsonEntity(body.toString()), String.class);
                log.info("[Qdrant] 集合 {} 已自动创建（含稀疏向量支持）", collectionName);
                collectionVerified.set(true);
            } catch (Exception ex) {
                // 稀疏向量配置可能不被旧版 Qdrant 支持，尝试不带稀疏向量创建
                log.warn("[Qdrant] 集合创建（含稀疏向量）失败，尝试不带稀疏向量创建: {}", ex.getMessage());
                try {
                    ObjectNode body2 = objectMapper.createObjectNode();
                    ObjectNode params2 = body2.putObject("vectors");
                    params2.put("size", getVectorDim());
                    params2.put("distance", "Cosine");
                    restTemplate.postForEntity(
                            qdrantUrl + "/collections/" + collectionName,
                            jsonEntity(body2.toString()), String.class);
                    log.info("[Qdrant] 集合 {} 已自动创建（不含稀疏向量，旧版Qdrant）", collectionName);
                    collectionVerified.set(true);
                    hybridSearchDegraded.set(true);
                } catch (Exception ex2) {
                    log.warn("[Qdrant] 集合创建失败: {}", ex2.getMessage());
                }
            }
        }
    }

    /**
     * 生成语义向量：优先 Voyage AI → DeepSeek → 伪向量（逐级降级）。
     * F5: 空文本返回 null（零向量的余弦相似度未定义，会产生无意义匹配结果）。
     * @return 向量数组；null 表示输入为空无法生成有效向量
     */
    private float[] computeEmbedding(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String activeProvider = resolveActiveProvider();
        String cacheKey = sha256Hex(text) + ":" + activeProvider;
        EmbeddingCacheEntry cached = embeddingCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            return cached.vector;
        }
        if (PROVIDER_AGNES.equals(activeProvider)) {
            try {
                float[] vector = tryAgnesEmbedding(text);
                if (vector != null) {
                    embeddingCache.put(cacheKey, new EmbeddingCacheEntry(vector, PROVIDER_AGNES));
                    evictCacheIfNeeded();
                    return vector;
                }
            } catch (Exception e) {
                log.warn("[Agnes] Embedding 调用失败，降级到 DeepSeek: {}", e.getMessage());
            }
        }
        if (PROVIDER_DEEPSEEK.equals(activeProvider)) {
            try {
                float[] vector = callEmbeddingApi(text);
                embeddingCache.put(cacheKey, new EmbeddingCacheEntry(vector, PROVIDER_DEEPSEEK));
                evictCacheIfNeeded();
                return vector;
            } catch (Exception e) {
                log.warn("[Qdrant] DeepSeek Embedding API 调用失败，降级为伪向量: {}", e.getMessage());
            }
        }
        return pseudoEmbedding(text);
    }

    private String resolveActiveProvider() {
        if (agnesApiKey != null && !agnesApiKey.isEmpty()) return PROVIDER_AGNES;
        if (deepseekApiKey != null && !deepseekApiKey.isEmpty()) return PROVIDER_DEEPSEEK;
        return "pseudo";
    }

    private void evictCacheIfNeeded() {
        if (embeddingCache.size() > EMBEDDING_CACHE_MAX) {
            embeddingCache.entrySet().removeIf(e -> e.getValue().isExpired());
        }
    }

    /**
     * 调用 DeepSeek Embedding API 获取真实语义向量。
     */
    private float[] callEmbeddingApi(String text) {
        String url = deepseekBaseUrl + "/v1/embeddings";
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", embeddingModel);
        body.put("input", text);
        body.put("encoding_format", "float");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(deepseekApiKey);
        HttpEntity<String> entity = new HttpEntity<>(body.toString(), headers);

        ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);
        if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
            JsonNode root;
            try {
                root = objectMapper.readTree(resp.getBody());
            } catch (Exception e) {
                throw new RuntimeException("Embedding response parse failed", e);
            }
            JsonNode embedding = root.path("data").path(0).path("embedding");
            if (embedding.isArray()) {
                float[] vec = new float[embedding.size()];
                for (int i = 0; i < embedding.size(); i++) {
                    vec[i] = (float) embedding.get(i).asDouble();
                }
                log.debug("[Qdrant] 真实语义向量生成成功，维度={}", vec.length);
                return vec;
            }
        }
        throw new RuntimeException("Embedding API returned unexpected response");
    }

    /** 获取当前使用的向量维度（agnes/deepseek 均为 1024 维，伪向量 128 维） */
    private int getVectorDim() {
        boolean hasRealKey = (agnesApiKey != null && !agnesApiKey.isEmpty())
                || (deepseekApiKey != null && !deepseekApiKey.isEmpty());
        return hasRealKey ? VECTOR_DIM_REAL : VECTOR_DIM_PSEUDO;
    }

    /**
     * 公开诊断方法 — 返回 Agnes/DeepSeek 配置状态，用于 /visual/diag 端点排查问题
     */
    public Map<String, Object> getVectorDimInfo() {
        Map<String, Object> info = new java.util.LinkedHashMap<>();
        boolean hasAgnes = agnesApiKey != null && !agnesApiKey.isEmpty();
        boolean hasDeepSeek = deepseekApiKey != null && !deepseekApiKey.isEmpty();
        boolean hasInferenceOrch = inferenceOrchestrator != null;
        info.put("hasAgnesKey", hasAgnes);
        info.put("agnesModel", agnesModel);
        info.put("agnesApiUrl", agnesApiUrl);
        info.put("hasDeepSeekKey", hasDeepSeek);
        info.put("deepseekBaseUrl", deepseekBaseUrl);
        info.put("deepseekEmbeddingModel", embeddingModel);
        info.put("hasInferenceOrchestrator", hasInferenceOrch);
        info.put("currentVectorDim", getVectorDim());
        info.put("realVectorDim", VECTOR_DIM_REAL);
        info.put("pseudoVectorDim", VECTOR_DIM_PSEUDO);
        if (hasAgnes && hasInferenceOrch) {
            info.put("recommendedMode", "agnes_vision_and_embedding (最佳质量)");
        } else if (hasDeepSeek) {
            info.put("recommendedMode", "deepseek_text_embedding (基础质量)");
        } else {
            info.put("recommendedMode", "pseudo_hashing (最低质量，不建议生产)");
        }
        return info;
    }

    /**
     * 伪向量生成（基于字符哈希），仅在 Embedding API 不可用时降级使用。
     */
    private float[] pseudoEmbedding(String text) {
        float[] vec = new float[VECTOR_DIM_PSEUDO];
        if (text == null || text.isEmpty()) return vec;
        // 对字符串字符进行分组哈希，映射到 [-1, 1]
        for (int i = 0; i < text.length(); i++) {
            int idx = (text.charAt(i) * 31 + i) % VECTOR_DIM_PSEUDO;
            if (idx < 0) idx += VECTOR_DIM_PSEUDO;
            vec[idx] += (float) Math.sin(text.charAt(i) * 0.1);
        }
        // 归一化
        float norm = 0;
        for (float v : vec) norm += v * v;
        norm = (float) Math.sqrt(norm);
        if (norm > 0) {
            for (int i = 0; i < vec.length; i++) vec[i] /= norm;
        }
        return vec;
    }

    private HttpEntity<String> jsonEntity(String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(json, headers);
    }

    // ──────────────────────────────────────────────────────────────
    //  款式图多模态接口
    // ──────────────────────────────────────────────────────────────

    /**
     * 对款式封面图生成语义向量，用于以图搜款和难度评估。
     *
     * <p>向量生成优先级（尽量只用 AGNES_API_KEY 一个 Key）：
     * 1. Agnes 视觉分析 + Agnes Embedding（图片→描述→向量，只需 AGNES_API_KEY）
     * 2. Agnes 视觉分析 + DeepSeek Embedding（图片→描述→向量，需两个 Key）
     * 3. DeepSeek 纯文本 Embedding（用图片 URL 文本生成向量，质量一般）
     * 4. 伪向量（哈希）— 最低质量，仅兜底
     */
    public float[] computeMultimodalEmbedding(String imageUrl) {
        if (!qdrantEnabled) return null;
        if (imageUrl == null || imageUrl.isBlank()) {
            throw new IllegalArgumentException("imageUrl 不能为空");
        }

        // ========== 运行时诊断：打印当前配置状态 ==========
        boolean hasAgnesKey = agnesApiKey != null && !agnesApiKey.isEmpty();
        boolean hasDeepSeekKey = deepseekApiKey != null && !deepseekApiKey.isEmpty();
        boolean hasInferenceOrch = inferenceOrchestrator != null;
        log.info("[Qdrant] 向量生成启动 imageUrlLen={} hasAgnesKey={} hasDeepSeekKey={} hasInferenceOrch={}",
                imageUrl.length(), hasAgnesKey, hasDeepSeekKey, hasInferenceOrch);

        // ========== 第 1 级：Agnes 视觉分析 → 文字描述 → Embedding 向量 ==========
        if (hasAgnesKey && hasInferenceOrch) {
            try {
                log.info("[Qdrant] 尝试方案1: Agnes视觉描述 + Agnes Embedding (模型={})", agnesModel);
                String visualDescription = describeImageWithAgnes(imageUrl);
                if (visualDescription != null && !visualDescription.isBlank()) {
                    log.info("[Qdrant] Agnes视觉描述成功 descLen={}", visualDescription.length());
                    // 方案1a: 尝试用 Agnes Embedding
                    float[] vec = tryAgnesEmbedding(visualDescription);
                    if (vec != null) {
                        log.info("[Qdrant] ✓ 方案1成功 Agnes视觉+Agnes Embedding 维度={}", vec.length);
                        return vec;
                    }
                    // 方案1b: Agnes Embedding 不支持，降级到 DeepSeek Embedding
                    if (hasDeepSeekKey) {
                        vec = callEmbeddingApi(visualDescription);
                        log.info("[Qdrant] ✓ 方案2成功 Agnes视觉+DeepSeek Embedding 维度={}", vec.length);
                        return vec;
                    }
                    // 方案1c: 只有 Agnes Key，用 Agnes Embedding 重试一次（兜底特殊路径）
                    log.warn("[Qdrant] 已获取视觉描述但无可用 Embedding endpoint，继续降级");
                } else {
                    log.warn("[Qdrant] Agnes视觉描述返回空");
                }
            } catch (Exception e) {
                log.warn("[Qdrant] Agnes视觉+Embedding 失败: {}", e.getMessage());
            }
        } else {
            log.warn("[Qdrant] 跳过 Agnes 链路: hasAgnesKey={} hasInferenceOrch={}", hasAgnesKey, hasInferenceOrch);
        }

        // ========== 第 2 级：DeepSeek 纯文本 Embedding（用图片 URL 文本生成向量） ==========
        if (hasDeepSeekKey) {
            log.info("[Qdrant] 尝试方案3: DeepSeek 文本 Embedding（用 imageUrl 文本）");
            try {
                float[] vec = callEmbeddingApi(imageUrl);
                log.info("[Qdrant] ✓ 方案3成功 DeepSeek 文本 Embedding 维度={}", vec.length);
                return vec;
            } catch (Exception e) {
                log.warn("[Qdrant] DeepSeek Embedding 失败: {}", e.getMessage());
            }
        }

        // ========== 第 3 级：伪向量兜底 ==========
        log.error("[Qdrant] ⚠ 所有 Embedding 方案不可用，降级为伪向量（搜索质量极低）！" +
                "建议：1)在微信云【环境变量】配置 AGNES_API_KEY 以启用视觉分析；" +
                "2)或配置 DEEPSEEK_API_KEY 启用文本 Embedding");
        return pseudoEmbedding(imageUrl);
    }

    /**
     * 尝试调用 Agnes 的 /v1/embeddings 端点。
     * Agnes 声称 OpenAI 兼容，如果支持 embeddings 端点，则只需一个 API Key。
     * 如果不支持，返回 null，由调用方降级到 DeepSeek。
     */
    private float[] tryAgnesEmbedding(String text) {
        try {
            String agnesBaseUrl = agnesApiUrl.replace("/chat/completions", "");
            String url = agnesBaseUrl + "/embeddings";
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", agnesModel);
            body.put("input", text);
            body.put("encoding_format", "float");

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(agnesApiKey);
            HttpEntity<String> entity = new HttpEntity<>(body.toString(), headers);

            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                JsonNode root = objectMapper.readTree(resp.getBody());
                JsonNode embedding = root.path("data").path(0).path("embedding");
                if (embedding.isArray() && embedding.size() > 0) {
                    float[] vec = new float[embedding.size()];
                    for (int i = 0; i < embedding.size(); i++) {
                        vec[i] = (float) embedding.get(i).asDouble();
                    }
                    log.info("[Qdrant] Agnes Embedding 端点可用！维度={}", vec.length);
                    return vec;
                }
            }
            log.debug("[Qdrant] Agnes Embedding 端点不可用，降级到 DeepSeek");
        } catch (Exception e) {
            log.debug("[Qdrant] Agnes Embedding 端点不可用: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 用 Agnes 视觉模型对图片生成文字描述，用于后续 Embedding。
     * 这比直接用图片 URL 做 Embedding 质量高得多，因为 Agnes 能理解图片内容。
     */
    private String describeImageWithAgnes(String imageUrl) {
        try {
            String desc = inferenceOrchestrator.chatWithVision(imageUrl,
                    "请用50字以内简洁描述这件服装的款式特征（领型、袖型、版型、面料质感、装饰工艺），"
                            + "仅描述可见的工艺特征，不评价颜色和风格。");
            if (desc != null && !desc.isBlank()) {
                return desc.length() > 200 ? desc.substring(0, 200) : desc;
            }
        } catch (Exception e) {
            log.debug("[Qdrant] Agnes 视觉描述失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 将款式图片向量存入 style_images 集合，供后续相似款式搜索。
     */
    public boolean upsertStyleImageVector(Long styleId, String styleNo, float[] embedding,
                                          String difficultyLevel, int difficultyScore,
                                          Long tenantId) {
        try {
            ensureStyleImageCollectionExists();
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            ObjectNode point = points.addObject();
            point.put("id", styleId);
            ArrayNode vec = point.putArray("vector");
            for (float v : embedding) vec.add(v);
            ObjectNode payloadNode = point.putObject("payload");
            payloadNode.put("style_no", styleNo != null ? styleNo : "");
            payloadNode.put("difficulty_level", difficultyLevel != null ? difficultyLevel : "MEDIUM");
            payloadNode.put("difficulty_score", difficultyScore);
            payloadNode.put("tenant_id", tenantId != null ? tenantId : 0L);
            String url = qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION + "/points";
            ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.PUT,
                    jsonEntity(body.toString()), String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            log.warn("[Qdrant] style_images upsert失败 styleId={}: {}", styleId, e.getMessage());
            return false;
        }
    }

    /**
     * 搜索视觉相似的历史款式（仅在 style_images 集合中检索）。
     */
    public List<SimilarStyle> searchSimilarStyleImages(float[] embedding, int topK, Long tenantId) {
        if (!qdrantEnabled) return Collections.emptyList();
        List<SimilarStyle> results = new ArrayList<>();
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode vec = body.putArray("vector");
            for (float v : embedding) vec.add(v);
            body.put("limit", topK);
            body.put("with_payload", true);
            // 租户隔离过滤（tenantId 为 null 时拒绝搜索，防止跨租户数据泄漏）
            if (tenantId == null) {
                log.warn("[Qdrant] style_images search拒绝: tenantId为null，跳过搜索以防止跨租户数据泄漏");
                return results;
            }
            ObjectNode filter = body.putObject("filter");
            ArrayNode should = filter.putArray("should");
            ObjectNode tenantCond = should.addObject();
            tenantCond.put("key", "tenant_id");
            tenantCond.putObject("match").put("integer", tenantId);
            ObjectNode publicCond = should.addObject();
            publicCond.put("key", "tenant_id");
            publicCond.putObject("match").put("integer", 0);
            String url = qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION + "/points/search";
            ResponseEntity<String> resp = restTemplate.postForEntity(url, jsonEntity(body.toString()), String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                JsonNode root = objectMapper.readTree(resp.getBody());
                for (JsonNode item : root.path("result")) {
                    SimilarStyle ss = new SimilarStyle();
                    ss.setStyleNo(item.path("payload").path("style_no").asText(""));
                    ss.setDifficultyLevel(item.path("payload").path("difficulty_level").asText("MEDIUM"));
                    ss.setDifficultyScore(item.path("payload").path("difficulty_score").asInt(5));
                    ss.setSimilarity((float) item.path("score").asDouble());
                    if (ss.getSimilarity() > 0.1f) {
                        results.add(ss);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Qdrant] style_images search失败: {}", e.getMessage());
        }
        return results;
    }

    private void ensureStyleImageCollectionExists() {
        if (styleImageCollectionVerified.get()) return;
        try {
            ResponseEntity<String> r = restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION, String.class);
            if (r.getStatusCode().is2xxSuccessful()) {
                styleImageCollectionVerified.set(true);
                return;
            }
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode params = body.putObject("vectors");
            params.put("size", VECTOR_DIM_REAL);
            params.put("distance", "Cosine");
            restTemplate.postForEntity(
                    qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION,
                    jsonEntity(body.toString()), String.class);
            log.info("[Qdrant] 集合 {} 已自动创建", STYLE_IMAGE_COLLECTION);
            styleImageCollectionVerified.set(true);
        } catch (Exception ex) {
            log.warn("[Qdrant] style_images集合创建失败: {}", ex.getMessage());
        }
    }

    public int backfillStyleImageTenantIds(java.util.Map<Long, Long> styleIdToTenantId) {
        if (styleIdToTenantId == null || styleIdToTenantId.isEmpty()) return 0;
        int updated = 0;
        try {
            ensureStyleImageCollectionExists();
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            for (Map.Entry<Long, Long> entry : styleIdToTenantId.entrySet()) {
                Long styleId = entry.getKey();
                Long tenantId = entry.getValue();
                ObjectNode point = points.addObject();
                point.put("id", styleId);
                ObjectNode payload = point.putObject("payload");
                payload.put("tenant_id", tenantId != null ? tenantId : 0L);
            }
            String url = qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION + "/points/payload";
            ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.POST,
                    jsonEntity(body.toString()), String.class);
            if (resp.getStatusCode().is2xxSuccessful()) {
                updated = styleIdToTenantId.size();
                log.info("[Qdrant] style_images tenant_id补刷完成, 共{}条", updated);
            }
        } catch (Exception e) {
            log.warn("[Qdrant] style_images tenant_id补刷失败: {}", e.getMessage());
        }
        return updated;
    }

    // ──────────────────────────────────────────────────────────────
    //  L5 Archival Memory — 每租户独立 collection，承载 6 个月+ 冷数据
    //  设计参考：five-layer-memory-design.md 第五章
    //  多租户安全：collection 名按 tenantId 隔离；payload 必含 tenant_id（双保险）
    // ──────────────────────────────────────────────────────────────

    /** 归档 collection 前缀，最终 collection 名为 archival_memory_{tenantId} */
    private static final String ARCHIVAL_COLLECTION_PREFIX = "archival_memory_";

    /** 已验证存在的归档 collection 缓存（避免每次查询都检查） */
    private final java.util.Set<Long> archivalCollectionsVerified =
            java.util.Collections.newSetFromMap(new ConcurrentHashMap<>());

    /**
     * 获取租户归档 collection 名。
     * @param tenantId 租户ID（必填，符合 P0 铁律 4）
     */
    private String archivalCollectionName(Long tenantId) {
        if (tenantId == null) {
            throw new IllegalArgumentException("[Archival] tenantId 不能为空（P0 铁律 4：多租户隔离）");
        }
        return ARCHIVAL_COLLECTION_PREFIX + tenantId;
    }

    /**
     * 确保租户归档 collection 存在（幂等）。
     * 启动时或首次写入前调用。
     * @param tenantId 租户ID
     * @return true=新建了 collection；false=已存在或 Qdrant 不可用
     */
    public synchronized boolean ensureArchivalCollection(Long tenantId) {
        if (!qdrantEnabled) return false;
        if (tenantId == null) return false;
        if (archivalCollectionsVerified.contains(tenantId)) return false;

        String collection = archivalCollectionName(tenantId);
        try {
            restTemplate.getForEntity(qdrantUrl + "/collections/" + collection, String.class);
            archivalCollectionsVerified.add(tenantId);
            return false; // 已存在
        } catch (Exception e) {
            try {
                ObjectNode body = objectMapper.createObjectNode();
                ObjectNode params = body.putObject("vectors");
                params.put("size", getVectorDim());
                params.put("distance", "Cosine");
                restTemplate.postForEntity(
                        qdrantUrl + "/collections/" + collection,
                        jsonEntity(body.toString()), String.class);
                log.info("[Archival] 租户 {} 归档 collection 已创建: {}", tenantId, collection);
                archivalCollectionsVerified.add(tenantId);
                return true;
            } catch (Exception ex) {
                log.warn("[Archival] 租户 {} 归档 collection 创建失败: {}", tenantId, ex.getMessage());
                return false;
            }
        }
    }

    /**
     * 写入一条归档记忆（L5）。
     * @param tenantId 租户ID（必填）
     * @param originalId 原表记录ID（t_ai_conversation_memory.id 或 t_ai_long_memory.id）
     * @param memoryType 记忆类型：conversation_summary / long_fact / long_episodic / long_reflective
     * @param summary 摘要文本（用于向量化）
     * @param keyEntities 关键实体 JSON（如 orderNo/styleNo/userId）
     * @param createTime 原记录创建时间（用于时间范围过滤）
     * @return true=成功；false=失败或 Qdrant 不可用
     */
    public boolean upsertArchival(Long tenantId, String originalId, String memoryType,
                                   String summary, String keyEntities, String createTime) {
        return upsertArchivalTiered(tenantId, originalId, memoryType, summary, keyEntities,
                createTime, null);
    }

    /**
     * 写入一条归档记忆（L5，P3-3 分级存储版本）。
     *
     * <p>根据 originalCreateTime 自动计算分级（HOT/WARM/COLD），写入 payload.tier 字段。
     * 召回时 {@link #searchArchivalTiered} 可按 tier 过滤，优先返回 HOT 数据。
     *
     * @param tier 分级（null 时根据 createTime 自动计算；createTime 也为空时默认 HOT）
     * @return true=成功；false=失败或 Qdrant 不可用
     */
    public boolean upsertArchivalTiered(Long tenantId, String originalId, String memoryType,
                                         String summary, String keyEntities, String createTime,
                                         com.fashion.supplychain.intelligence.entity.ArchivalTier tier) {
        if (!qdrantEnabled) return false;
        if (tenantId == null || originalId == null) return false;
        if (summary == null || summary.isBlank()) return false;

        ensureArchivalCollection(tenantId);

        // P3-3：分级计算（优先使用传入 tier，否则根据 createTime 推导）
        com.fashion.supplychain.intelligence.entity.ArchivalTier finalTier = tier;
        if (finalTier == null) {
            java.time.LocalDateTime originalTime = parseCreateTime(createTime);
            finalTier = com.fashion.supplychain.intelligence.entity.ArchivalTier.of(
                    originalTime, java.time.LocalDateTime.now());
        }

        try {
            float[] vector = computeEmbedding(summary);
            if (vector == null) {
                log.debug("[Archival] 向量生成失败，跳过归档 tenantId={} originalId={}", tenantId, originalId);
                return false;
            }

            String pointId = tenantId + ":" + originalId;
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            ObjectNode point = points.addObject();
            point.put("id", pointId);
            point.put("vector", toJsonArray(vector));

            ObjectNode payload = point.putObject("payload");
            payload.put("tenant_id", tenantId); // P0 铁律 4：payload 必含 tenant_id
            payload.put("original_id", originalId);
            payload.put("memory_type", memoryType != null ? memoryType : "unknown");
            payload.put("summary", summary.length() > 1000 ? summary.substring(0, 1000) : summary);
            payload.put("key_entities", keyEntities != null ? keyEntities : "");
            payload.put("create_time", createTime != null ? createTime : "");
            payload.put("archived_at", System.currentTimeMillis());
            payload.put("tier", finalTier.name()); // P3-3：分级字段

            String url = qdrantUrl + "/collections/" + archivalCollectionName(tenantId) + "/points?wait=true";
            restTemplate.postForEntity(url, jsonEntity(body.toString()), String.class);
            return true;
        } catch (Exception e) {
            log.warn("[Archival] 写入归档失败 tenantId={} originalId={}: {}", tenantId, originalId, e.getMessage());
            return false;
        }
    }

    /**
     * P3-3：解析 create_time 字符串为 LocalDateTime（容错处理）。
     */
    private java.time.LocalDateTime parseCreateTime(String createTime) {
        if (createTime == null || createTime.isBlank()) return null;
        try {
            return java.time.LocalDateTime.parse(createTime);
        } catch (Exception e) {
            // 兼容 ISO 末尾带 Z 的格式
            try {
                return java.time.LocalDateTime.parse(createTime.replace("Z", ""));
            } catch (Exception ex) {
                return null;
            }
        }
    }

    /**
     * 检索归档记忆（L5 召回）。
     * @param tenantId 租户ID（必填，跨租户隔离）
     * @param queryText 查询文本
     * @param topK 返回条数（默认 5）
     * @param startTimeIso 可选起始时间（ISO 格式，如 "2026-01-01T00:00:00"），null 不过滤
     * @param endTimeIso 可选结束时间，null 不过滤
     * @return 命中结果列表（按相似度降序）；空列表表示无结果或 Qdrant 不可用
     */
    public List<ScoredPoint> searchArchival(Long tenantId, String queryText, int topK,
                                             String startTimeIso, String endTimeIso) {
        if (!qdrantEnabled) return List.of();
        if (tenantId == null || queryText == null || queryText.isBlank()) return List.of();
        if (topK <= 0 || topK > 50) topK = 5;

        ensureArchivalCollection(tenantId);

        try {
            float[] vector = computeEmbedding(queryText);
            if (vector == null) return List.of();

            ObjectNode body = objectMapper.createObjectNode();
            body.put("vector", toJsonArray(vector));
            body.put("limit", topK);
            body.put("with_payload", true);

            // 必带 tenant_id 过滤（双保险，即使 collection 名已含 tenantId）
            ObjectNode filter = body.putObject("filter");
            ArrayNode must = filter.putArray("must");
            ObjectNode tenantCond = must.addObject();
            tenantCond.put("key", "tenant_id");
            tenantCond.putObject("match").put("integer", tenantId);

            // 时间范围过滤（可选）
            if (startTimeIso != null && !startTimeIso.isBlank()
                    && endTimeIso != null && !endTimeIso.isBlank()) {
                ObjectNode rangeCond = must.addObject();
                rangeCond.put("key", "create_time");
                ObjectNode range = rangeCond.putObject("range");
                range.put("gte", startTimeIso);
                range.put("lte", endTimeIso);
            }

            String url = qdrantUrl + "/collections/" + archivalCollectionName(tenantId) + "/points/search";
            ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.POST, jsonEntity(body.toString()), String.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) return List.of();

            JsonNode root = objectMapper.readTree(resp.getBody());
            JsonNode resultArr = root.path("result");
            if (!resultArr.isArray()) return List.of();

            List<ScoredPoint> results = new ArrayList<>();
            for (JsonNode item : resultArr) {
                ScoredPoint sp = new ScoredPoint();
                sp.setPointId(item.path("id").asText());
                sp.setScore((float) item.path("score").asDouble());
                sp.setPayload(readPayload(item.path("payload")));
                results.add(sp);
            }
            return results;
        } catch (Exception e) {
            log.debug("[Archival] 检索归档失败 tenantId={}: {}", tenantId, e.getMessage());
            return List.of();
        }
    }

    /**
     * P3-3：分级召回策略 — 默认只搜 HOT 层；HOT 不足时扩展到 WARM；全量查询时搜全部。
     *
     * <p>策略说明：
     * <ul>
     *   <li>{@code tierFilter=null}：全量搜索（HOT+WARM+COLD），用于明确历史查询</li>
     *   <li>{@code tierFilter=[HOT]}：仅搜 HOT（默认场景，速度快）</li>
     *   <li>{@code tierFilter=[HOT, WARM]}：HOT 不足时扩展（兜底场景）</li>
     * </ul>
     *
     * @param tierFilter 分级过滤（null 表示全量搜索）
     */
    public List<ScoredPoint> searchArchivalTiered(Long tenantId, String queryText, int topK,
                                                   String startTimeIso, String endTimeIso,
                                                   java.util.List<com.fashion.supplychain.intelligence.entity.ArchivalTier> tierFilter) {
        if (!qdrantEnabled) return List.of();
        if (tenantId == null || queryText == null || queryText.isBlank()) return List.of();
        if (topK <= 0 || topK > 50) topK = 5;

        ensureArchivalCollection(tenantId);

        try {
            float[] vector = computeEmbedding(queryText);
            if (vector == null) return List.of();

            ObjectNode body = objectMapper.createObjectNode();
            body.put("vector", toJsonArray(vector));
            body.put("limit", topK);
            body.put("with_payload", true);

            // 必带 tenant_id 过滤（双保险）
            ObjectNode filter = body.putObject("filter");
            ArrayNode must = filter.putArray("must");
            ObjectNode tenantCond = must.addObject();
            tenantCond.put("key", "tenant_id");
            tenantCond.putObject("match").put("integer", tenantId);

            // P3-3：分级过滤
            if (tierFilter != null && !tierFilter.isEmpty()) {
                ObjectNode tierCond = must.addObject();
                tierCond.put("key", "tier");
                ObjectNode matchAny = tierCond.putObject("match");
                ArrayNode any = matchAny.putArray("any");
                for (com.fashion.supplychain.intelligence.entity.ArchivalTier t : tierFilter) {
                    any.add(t.name());
                }
            }

            // 时间范围过滤（可选）
            if (startTimeIso != null && !startTimeIso.isBlank()
                    && endTimeIso != null && !endTimeIso.isBlank()) {
                ObjectNode rangeCond = must.addObject();
                rangeCond.put("key", "create_time");
                ObjectNode range = rangeCond.putObject("range");
                range.put("gte", startTimeIso);
                range.put("lte", endTimeIso);
            }

            String url = qdrantUrl + "/collections/" + archivalCollectionName(tenantId) + "/points/search";
            ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.POST,
                    jsonEntity(body.toString()), String.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) return List.of();

            JsonNode root = objectMapper.readTree(resp.getBody());
            JsonNode resultArr = root.path("result");
            if (!resultArr.isArray()) return List.of();

            List<ScoredPoint> results = new ArrayList<>();
            for (JsonNode item : resultArr) {
                ScoredPoint sp = new ScoredPoint();
                sp.setPointId(item.path("id").asText());
                sp.setScore((float) item.path("score").asDouble());
                sp.setPayload(readPayload(item.path("payload")));
                results.add(sp);
            }
            return results;
        } catch (Exception e) {
            log.debug("[Archival] 分级检索失败 tenantId={}: {}", tenantId, e.getMessage());
            return List.of();
        }
    }

    /**
     * P3-3：分级召回 — 智能扩展策略。
     *
     * <p>调用流程：
     * <ol>
     *   <li>先搜 HOT 层（topK）</li>
     *   <li>若 HOT 结果不足 half（topK/2），扩展到 HOT+WARM</li>
     *   <li>若仍不足且 includeCold=true，扩展到全部 tier</li>
     * </ol>
     *
     * @param includeCold 是否最终兜底到 COLD 层
     */
    public List<ScoredPoint> searchArchivalSmart(Long tenantId, String queryText, int topK,
                                                  String startTimeIso, String endTimeIso,
                                                  boolean includeCold) {
        if (!qdrantEnabled) return List.of();
        if (tenantId == null || queryText == null || queryText.isBlank()) return List.of();
        if (topK <= 0 || topK > 50) topK = 5;

        // 第1轮：仅 HOT
        List<ScoredPoint> hotResults = searchArchivalTiered(tenantId, queryText, topK,
                startTimeIso, endTimeIso, List.of(com.fashion.supplychain.intelligence.entity.ArchivalTier.HOT));
        if (hotResults.size() >= topK) {
            return hotResults;
        }

        // 第2轮：HOT + WARM
        int half = Math.max(1, topK / 2);
        if (hotResults.size() < half) {
            List<ScoredPoint> warmResults = searchArchivalTiered(tenantId, queryText, topK,
                    startTimeIso, endTimeIso,
                    List.of(com.fashion.supplychain.intelligence.entity.ArchivalTier.HOT,
                            com.fashion.supplychain.intelligence.entity.ArchivalTier.WARM));
            if (warmResults.size() >= topK || !includeCold) {
                return warmResults;
            }

            // 第3轮：全量（HOT+WARM+COLD）
            if (warmResults.size() < half) {
                return searchArchivalTiered(tenantId, queryText, topK,
                        startTimeIso, endTimeIso,
                        List.of(com.fashion.supplychain.intelligence.entity.ArchivalTier.HOT,
                                com.fashion.supplychain.intelligence.entity.ArchivalTier.WARM,
                                com.fashion.supplychain.intelligence.entity.ArchivalTier.COLD));
            }
        }

        return hotResults;
    }

    /**
     * P3-3：统计租户归档 collection 的分级分布。
     *
     * @return Map：tier 名 → 计数；空 Map 表示 Qdrant 不可用或 collection 不存在
     */
    public java.util.Map<String, Long> countArchivalByTier(Long tenantId) {
        java.util.Map<String, Long> result = new java.util.LinkedHashMap<>();
        if (!qdrantEnabled) return result;
        if (tenantId == null) return result;

        ensureArchivalCollection(tenantId);

        try {
            for (com.fashion.supplychain.intelligence.entity.ArchivalTier tier :
                    com.fashion.supplychain.intelligence.entity.ArchivalTier.values()) {
                ObjectNode body = objectMapper.createObjectNode();
                body.put("exact", true);
                ObjectNode filter = body.putObject("filter");
                ArrayNode must = filter.putArray("must");

                ObjectNode tenantCond = must.addObject();
                tenantCond.put("key", "tenant_id");
                tenantCond.putObject("match").put("integer", tenantId);

                ObjectNode tierCond = must.addObject();
                tierCond.put("key", "tier");
                tierCond.putObject("match").put("keyword", tier.name());

                String url = qdrantUrl + "/collections/" + archivalCollectionName(tenantId)
                        + "/points/count";
                ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.POST,
                        jsonEntity(body.toString()), String.class);
                if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                    JsonNode root = objectMapper.readTree(resp.getBody());
                    long count = root.path("result").path("count").asLong(0);
                    result.put(tier.name(), count);
                } else {
                    result.put(tier.name(), 0L);
                }
            }
        } catch (Exception e) {
            log.debug("[Archival] 分级统计失败 tenantId={}: {}", tenantId, e.getMessage());
        }
        return result;
    }

    /**
     * 删除租户归档 collection（用于租户注销/数据清理）。
     * @return true=成功；false=失败或 Qdrant 不可用
     */
    public boolean deleteArchivalCollection(Long tenantId) {
        if (!qdrantEnabled) return false;
        if (tenantId == null) return false;
        try {
            restTemplate.delete(qdrantUrl + "/collections/" + archivalCollectionName(tenantId));
            archivalCollectionsVerified.remove(tenantId);
            log.info("[Archival] 租户 {} 归档 collection 已删除", tenantId);
            return true;
        } catch (Exception e) {
            log.warn("[Archival] 删除租户 {} 归档 collection 失败: {}", tenantId, e.getMessage());
            return false;
        }
    }

    /** 数组转换辅助 */
    private ArrayNode toJsonArray(float[] vector) {
        ArrayNode arr = objectMapper.createArrayNode();
        for (float v : vector) arr.add(v);
        return arr;
    }

    // ──────────────────────────────────────────────────────────────
    //  内嵌 DTO
    // ──────────────────────────────────────────────────────────────

    @lombok.Data
    public static class ScoredPoint {
        private String pointId;
        private float score;
        private Map<String, String> payload;
    }

    @lombok.Data
    public static class SimilarStyle {
        private String styleNo;
        private String difficultyLevel;
        private int difficultyScore;
        private float similarity;
    }
}
