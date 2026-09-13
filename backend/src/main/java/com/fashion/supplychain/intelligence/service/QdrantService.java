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
import java.util.concurrent.atomic.AtomicLong;
import java.security.MessageDigest;
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
 * <p>向量生成优先级：① 主模型(deepseek-flash 多模态)视觉分析 + Embedding（图片→文字描述→向量，推荐）
 *                   ② Embedding API（用图片URL文本生成向量）
 *                   ③ 关键词哈希伪向量（pseudoEmbedding，128维，无需 API Key）
 *
 * <p>注意：Embedding 实际提供方由 ai.embedding.* 决定（当前线上为硅基流动 BAAI/bge-m3，1024 维）。
 *         DeepSeek 官方并未提供 embeddings 接口，日志里的「Embedding(...)」会打印真实模型，勿再写死 DeepSeek。
 *
 * <p>配置项（application.yml）：
 * <pre>
 * intelligence:
 *   qdrant:
 *     url: http://localhost:6333
 *     collection: fashion_memory            # 旧集合名，切换时保留用于回退
 *     collection-name: fashion_memory       # 实际生效的集合名，未配置时回落 collection
 *     named-vectors: false                  # 默认 false=未命名 dense，行为与改造前一致
 *     vector-size: 1024
 * ai:
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
    /** 命名向量模式下稠密向量的名称：空串表示"默认命名向量"，与未命名模式在写入格式上区分开 */
    private static final String DENSE_VECTOR_NAME = "";
    /** payload 中原文的截断长度，防止超长正文撑爆 payload */
    private static final int CONTENT_PAYLOAD_MAX_LEN = 1000;

    @Value("${intelligence.qdrant.url:http://localhost:6333}")
    private String qdrantUrl;

    /**
     * 主集合名。优先取 {@code intelligence.qdrant.collection-name}，未配置时回落到
     * {@code intelligence.qdrant.collection}，最终默认 {@code fashion_memory}。
     *
     * <p>拆出 collection-name 是为了切换新集合时不用改掉旧值——旧集合名留在 collection 里，
     * 出问题把 collection-name 删掉/改回即可回退。
     */
    @Value("${intelligence.qdrant.collection-name:${intelligence.qdrant.collection:" + COLLECTION_DEFAULT + "}}")
    private String collectionName;

    @Value("${ai.deepseek.api-key:}")
    private String deepseekApiKey;

    @Value("${ai.deepseek.embedding-model:text-embedding-v2}")
    private String embeddingModel;

    @Value("${ai.deepseek.base-url:https://api.deepseek.com}")
    private String deepseekBaseUrl;

    // ── 独立 Embedding 提供方（OpenAI 兼容 /v1/embeddings）──
    // DeepSeek 官方无 embeddings 接口（404 实证 2026-09-13），真实语义向量需配置独立提供方，
    // 推荐：硅基流动 https://api.siliconflow.cn + BAAI/bge-m3（1024维，与 VECTOR_DIM_REAL 对齐，有免费额度）
    @Value("${ai.embedding.api-key:}")
    private String embeddingApiKey;

    @Value("${ai.embedding.base-url:https://api.siliconflow.cn}")
    private String embeddingBaseUrl;

    @Value("${ai.embedding.model:BAAI/bge-m3}")
    private String embeddingModelName;

    /** Embedding 接口路径：标准 OpenAI 兼容为 /v1/embeddings；智谱为 /api/paas/v4/embeddings */
    @Value("${ai.embedding.path:/v1/embeddings}")
    private String embeddingPath;

    /** 指定输出维度（智谱 embedding-3 支持 256/512/1024/2048）；0=不传该参数 */
    @Value("${ai.embedding.dimensions:0}")
    private int embeddingDimensions;

    /** 编码格式：Voyage 只认 base64；部分提供方（如智谱）不认此参数，留空则不传 */
    @Value("${ai.embedding.encoding-format:base64}")
    private String embeddingEncodingFormat;

    /** Embedding 远端永久性失败（404 等）熔断标记：本次运行内不再重试，避免预向量化刷屏 */
    private volatile boolean embeddingRemoteBroken = false;

    /** Embedding key 指纹只打一次 */
    private final java.util.concurrent.atomic.AtomicBoolean embeddingKeyFingerprintLogged =
            new java.util.concurrent.atomic.AtomicBoolean(false);

    @Value("${intelligence.qdrant.enabled:false}")
    private boolean qdrantEnabled;

    /** 启动探测通过后为 true；一旦探测/Qdrant 不可用则置 false，短路后续所有调用（避免反复连不上+白调付费 embedding） */
    private volatile boolean qdrantReady = true;

    private boolean qdrantActive() {
        return qdrantEnabled && qdrantReady;
    }

    /**
     * 稀疏向量 v2（默认关闭）：去掉中文单字符噪声 + token 哈希从 10 万桶扩到 31 位。
     *
     * <p>⚠️ 与存量索引不兼容：v1 用 {@code hashCode() % 100000}，v2 用 {@code hashCode() & 0x7FFFFFFF}，
     * 同一批存量向量是按 v1 哈希写入的。开启 v2 后若不重建索引，查询侧的新哈希与库里的旧哈希对不上，
     * sparse 侧会完全召回不到（dense 不受影响，混合检索退化为纯 dense）。
     *
     * <p>开启步骤：①全量重建 sparse 索引 → ②置 {@code intelligence.qdrant.sparse-v2=true} → ③重启。
     * 失败回滚：改回 false 重启即可，无需再动数据。
     */
    @Value("${intelligence.qdrant.sparse-v2:false}")
    private boolean sparseV2;

    /**
     * 命名向量模式开关（默认关闭）。
     *
     * <p>true：集合按 {@code vectors: {"": {size, distance}} + sparse_vectors: {"text-sparse": {}}}
     * 创建/识别，写入时同一个点同时携带 dense("") 与 sparse("text-sparse")，混合检索才真正生效。
     *
     * <p>false（默认）：集合仍按未命名 dense 创建，写入、检索与改造前逐字节一致，不写 sparse。
     *
     * <p>⚠️ Qdrant 不支持原地修改集合的向量定义，未命名 dense 与命名 sparse 也无法共存于同一个点，
     * 因此开启本开关必须配合新建集合（换 {@code intelligence.qdrant.collection-name}）+ 重灌数据。
     *
     * <p>切换：① 设新 collection-name 且 named-vectors=true → ② 重启 → ③ 重灌 → ④ 验证 sparse 命中。
     * 回退：把 collection-name 改回旧集合名、named-vectors 改回 false 重启即可，旧集合全程未被修改。
     */
    @Value("${intelligence.qdrant.named-vectors:false}")
    private boolean namedVectorsEnabled;

    @Value("${intelligence.qdrant.timeout-seconds:10}")
    private int qdrantTimeoutSeconds;

    /** Qdrant 连接失败静默：首次 ERROR，之后 5 分钟内同操作降级为 DEBUG，避免刷屏 */
    private static final long CONN_FAIL_SILENCE_MS = 5 * 60 * 1000L;
    private final ConcurrentHashMap<String, AtomicLong> connFailFirstLogAt = new ConcurrentHashMap<>();

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private RestTemplate restTemplate;

    private final ConcurrentHashMap<String, EmbeddingCacheEntry> embeddingCache = new ConcurrentHashMap<>();
    private static final long EMBEDDING_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(30);
    private static final int EMBEDDING_CACHE_MAX = 500;
    private static final String PROVIDER_DEEPSEEK = "deepseek";

    private final AtomicBoolean collectionVerified = new AtomicBoolean(false);
    private final AtomicBoolean styleImageCollectionVerified = new AtomicBoolean(false);
    /** 混合检索降级标记：true 表示 Qdrant 不支持混合检索，后续直接走纯稠密检索 */
    private final AtomicBoolean hybridSearchDegraded = new AtomicBoolean(false);
    /** 主集合是否为命名向量模式：null=尚未探测，true=可写 dense("")+sparse，false=只能写未命名 dense */
    private volatile Boolean namedVectorMode;
    /** 命名向量模式下 sparse 是否真的可用（集合降级为不含 sparse 时为 false） */
    private volatile boolean sparseWriteEnabled = false;

    private static class EmbeddingCacheEntry {
        final float[] vector;
        final long createdAt;
        EmbeddingCacheEntry(float[] vector) {
            this.vector = vector;
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

    /**
     * Qdrant 连接失败静默日志：首次失败记 WARN，之后 5 分钟内同操作降级为 DEBUG。
     * 避免连接不通时每个请求都刷一条 WARN 日志。
     */
    private void logQdrantConnFail(String operation, String detail) {
        long now = System.currentTimeMillis();
        AtomicLong firstAt = connFailFirstLogAt.computeIfAbsent(operation, k -> new AtomicLong(0));
        long first = firstAt.get();
        if (first == 0 || now - first >= CONN_FAIL_SILENCE_MS) {
            // 首次或静默窗口已过，记一次 WARN 并重置计时
            firstAt.set(now);
            log.warn("[Qdrant] {} 失败: {}（此后5分钟内同类错误将静默）", operation, detail);
        } else {
            log.debug("[Qdrant] {} 失败（静默中）: {}", operation, detail);
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
                JsonNode vectorsNode = root.path("result").path("config")
                        .path("params").path("vectors");
                // 命名向量模式下 vectors 是 {"": {size,...}}，维度挂在默认向量分支下
                JsonNode vecParams = vectorsNode.has("size") ? vectorsNode
                        : vectorsNode.path(DENSE_VECTOR_NAME);
                long storedDim = vecParams.path("size").asLong(-1);
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
        } catch (org.springframework.web.client.HttpStatusCodeException httpEx) {
            if (httpEx.getStatusCode().value() == 404) {
                // 集合尚未创建（首次使用场景），属正常状态，保持启用；首次 upsert 时会自动创建
                log.debug("[Qdrant] 集合 {} 尚未创建，跳过启动维度校验（首次使用时自动创建）", collectionName);
            } else {
                qdrantReady = false;
                log.warn("[Qdrant] 启动探测失败（url={}）: {} — 本实例已自动禁用向量记忆，相关检索降级为空结果；"
                        + "如需启用请启动 Qdrant 服务或在环境变量配置 QDRANT_URL/QDRANT_ENABLED",
                        qdrantUrl, httpEx.getMessage());
            }
        } catch (Exception e) {
            // 启动探测失败（如云端容器无 Qdrant）：本实例直接短路，避免每次 AI 查询都
            // 先调付费 embedding 再连接失败的浪费，同时停止 Connection refused 刷屏
            qdrantReady = false;
            log.warn("[Qdrant] 启动探测失败（url={}）: {} — 本实例已自动禁用向量记忆，相关检索降级为空结果；"
                    + "如需启用请启动 Qdrant 服务或在环境变量配置 QDRANT_URL/QDRANT_ENABLED",
                    qdrantUrl, e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  公开接口
    // ──────────────────────────────────────────────────────────────

    /**
     * 向量化存储一条记忆。
     *
     * <p>集合为命名向量模式时，同一个点同时写入 dense("") 与 sparse("text-sparse")，
     * 否则只写未命名 dense 数组（与改造前完全一致）。
     *
     * @param pointId  唯一ID（使用 t_intelligence_memory.id 转字符串）
     * @param tenantId 租户ID（用于 payload 过滤）
     * @param content  记忆文本（用于生成伪向量与稀疏向量）
     * @param payload  附加元数据（title/type/domain 等）
     * @return 是否成功
     */
    public boolean upsertVector(String pointId, Long tenantId, String content,
            java.util.Map<String, Object> payload) {
        if (!qdrantActive()) return false;
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

            boolean named = Boolean.TRUE.equals(namedVectorMode);

            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            ObjectNode point = points.addObject();
            point.put("id", toPointId(pointId));

            if (named) {
                ObjectNode vectorNode = point.putObject("vector");
                vectorNode.set(DENSE_VECTOR_NAME, toJsonArray(vector));
                SparseVector sparseVector = null;
                if (sparseWriteEnabled) {
                    sparseVector = computeSparseVector(content);
                    if (sparseVector != null && !sparseVector.indices.isEmpty()) {
                        vectorNode.set(SPARSE_VECTOR_NAME, toSparseJson(sparseVector));
                    } else {
                        log.debug("[Qdrant] sparse写入跳过：文本未产出有效token pointId={}", pointId);
                    }
                }
                log.debug("[Qdrant] upsert 命名向量模式 pointId={} dense={} sparse={}",
                        pointId, vector.length,
                        sparseVector == null ? 0 : sparseVector.indices.size());
            } else {
                // 未命名模式：保持改造前的点格式，一个字节都不变
                point.set("vector", toJsonArray(vector));
            }

            ObjectNode payloadNode = point.putObject("payload");
            payloadNode.put("tenant_id", tenantId);
            // 原始业务ID入payload：点ID已转UUID，检索侧凭此还原，保证下游按原始ID回查DB不断链
            payloadNode.put("original_id", pointId);
            // 原文入payload：为将来重建索引与线上排查留后路，超长截断避免撑爆 payload
            if (content != null && !content.isBlank()) {
                payloadNode.put("content", truncate(content, CONTENT_PAYLOAD_MAX_LEN));
            }
            if (payload != null) {
                payload.forEach((k, v) -> payloadNode.put(k, String.valueOf(v)));
            }

            String url = qdrantUrl + "/collections/" + collectionName + "/points";
            HttpEntity<String> entity = jsonEntity(body.toString());
            ResponseEntity<String> resp = restTemplate.exchange(url,
                    HttpMethod.PUT, entity, String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            logQdrantConnFail("upsert", "pointId=" + pointId + " " + e.getMessage());
            return false;
        }
    }

    /** 稀疏向量 → Qdrant 命名向量格式 {"indices":[...],"values":[...]} */
    private ObjectNode toSparseJson(SparseVector sv) {
        ObjectNode node = objectMapper.createObjectNode();
        ArrayNode indices = node.putArray("indices");
        ArrayNode values = node.putArray("values");
        for (int i = 0; i < sv.indices.size(); i++) {
            indices.add(sv.indices.get(i));
            values.add(sv.values.get(i));
        }
        return node;
    }

    /** 超长文本截断，避免撑爆 payload */
    private static String truncate(String text, int maxLen) {
        if (text == null) return null;
        return text.length() > maxLen ? text.substring(0, maxLen) : text;
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
        if (!qdrantActive()) return Collections.emptyList();
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
                        restoreOriginalId(sp);
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

    /** 点ID已转UUID存储：payload 若带 original_id 则还原为原始业务ID，保证下游按原ID回查DB不断链 */
    private void restoreOriginalId(ScoredPoint sp) {
        if (sp.getPayload() != null) {
            String originalId = sp.getPayload().get("original_id");
            if (originalId != null && !originalId.isEmpty()) {
                sp.setPointId(originalId);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  混合检索（稀疏+稠密）
    // ──────────────────────────────────────────────────────────────

    /**
     * 混合检索：同时执行稠密向量检索和稀疏关键词检索，用 RRF 融合后返回。
     *
     * <p>Qdrant Query API 没有顶层 {@code sparse_vector} 字段（旧写法会被忽略，等于纯稠密检索）。
     * 正确用法是 {@code prefetch} 双路 —— dense 一路 + sparse 一路 —— 加顶层 {@code query: {fusion: rrf}}。
     *
     * <p>集合不是命名向量模式（未切换集合，默认情况）时，库里没有 sparse 数据，
     * 直接走纯稠密检索 {@link #search}，与改造前行为一致。
     * 若 Qdrant 不支持混合检索（旧版本），捕获异常后降级到纯稠密检索。
     *
     * @param tenantId  租户ID（必须非null，否则拒绝搜索）
     * @param queryText 查询文本
     * @param topK      返回条数
     * @return 匹配点列表（按综合分数降序）
     */
    public List<ScoredPoint> hybridSearch(Long tenantId, String queryText, int topK) {
        if (!qdrantActive()) return new ArrayList<>();
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

            // 集合没有 sparse 配置（默认未切换场景）→ 纯稠密，行为与改造前一致
            if (!sparseWriteEnabled) {
                log.debug("[Qdrant] hybridSearch 走纯稠密：集合 {} 未启用 sparse（named={}）",
                        collectionName, namedVectorMode);
                return search(tenantId, queryText, topK);
            }

            // 1. 生成稠密向量
            float[] denseVector = computeEmbedding(queryText);
            if (denseVector == null) {
                log.warn("[Qdrant] hybridSearch跳过：查询文本为空无法生成向量");
                return new ArrayList<>();
            }

            // 2. 生成稀疏向量
            SparseVector sparseVector = computeSparseVector(queryText);
            if (sparseVector == null || sparseVector.indices.isEmpty()) {
                // sparse 侧无 token（纯标点/空串等）不影响稠密结果，退化为本轮纯稠密
                log.debug("[Qdrant] hybridSearch 查询未产出 sparse token，本轮退化为纯稠密");
                return search(tenantId, queryText, topK);
            }

            // 3. 构造 /points/query 请求体：prefetch 双路 + RRF 融合
            ObjectNode body = objectMapper.createObjectNode();
            int prefetchLimit = Math.max(topK * 3, 20);

            ArrayNode prefetch = body.putArray("prefetch");

            // 3.1 稠密一路（分数是余弦，沿用 0.3 低质量过滤）
            ObjectNode densePrefetch = prefetch.addObject();
            densePrefetch.set("query", toJsonArray(denseVector));
            densePrefetch.put("using", DENSE_VECTOR_NAME);
            densePrefetch.put("limit", prefetchLimit);
            densePrefetch.put("score_threshold", 0.3);
            densePrefetch.set("filter", tenantFilter(tenantId));

            // 3.2 稀疏一路（BM25 风格 token，分数不是余弦，不设阈值）
            ObjectNode sparsePrefetch = prefetch.addObject();
            sparsePrefetch.set("query", toSparseJson(sparseVector));
            sparsePrefetch.put("using", SPARSE_VECTOR_NAME);
            sparsePrefetch.put("limit", prefetchLimit);
            sparsePrefetch.set("filter", tenantFilter(tenantId));

            body.put("limit", topK);
            body.put("with_payload", true);
            // 注意：融合后分数是 RRF 排名分（量级远小于余弦），不能再套 0.3 阈值，否则一条都出不来

            // 4. 调用 /points/query 端点
            String url = qdrantUrl + "/collections/" + collectionName + "/points/query";

            // 4.1 顶层 RRF 融合。Qdrant 各版本的 RRF 写法不一致：新版 {"rrf":{}}，旧版 {"fusion":"rrf"}。
            //     先按新版发，被 4xx 拒绝则用旧版重试一次；两次都失败抛异常，交给下面的纯稠密降级。
            ResponseEntity<String> resp;
            try {
                body.putObject("query").putObject("rrf");
                resp = restTemplate.postForEntity(url, jsonEntity(body.toString()), String.class);
            } catch (org.springframework.web.client.HttpStatusCodeException e) {
                if (!e.getStatusCode().is4xxClientError()) throw e;
                log.info("[Qdrant] RRF 新版写法被拒（{}），改用旧版 fusion 写法重试", e.getStatusCode().value());
                body.putObject("query").put("fusion", "rrf");
                resp = restTemplate.postForEntity(url, jsonEntity(body.toString()), String.class);
            }

            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                List<ScoredPoint> results = new ArrayList<>();
                JsonNode resultNode = objectMapper.readTree(resp.getBody()).path("result");
                // /points/query 返回 {"result":{"points":[...]}}；直挂数组是 /points/search 的响应格式，两种都兼容
                JsonNode pointsNode = resultNode.isArray() ? resultNode : resultNode.path("points");
                if (!pointsNode.isArray()) {
                    log.warn("[Qdrant] hybridSearch 响应结构异常（无 points 数组），降级为纯稠密检索");
                    return search(tenantId, queryText, topK);
                }
                for (JsonNode item : pointsNode) {
                    ScoredPoint sp = new ScoredPoint();
                    sp.setPointId(item.path("id").asText());
                    sp.setScore((float) item.path("score").asDouble());
                    sp.setPayload(readPayload(item.path("payload")));
                    restoreOriginalId(sp);
                    results.add(sp);
                }
                log.info("[Qdrant] hybridSearch(prefetch+RRF) tenantId={} dense={} sparseTokens={} 命中={}",
                        tenantId, denseVector.length, sparseVector.indices.size(), results.size());
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

    /** 租户隔离过滤器：命中本租户或公共(tenant_id=0)数据 */
    private ObjectNode tenantFilter(Long tenantId) {
        ObjectNode filter = objectMapper.createObjectNode();
        ArrayNode should = filter.putArray("should");
        ObjectNode tenantCond = should.addObject();
        tenantCond.put("key", "tenant_id");
        tenantCond.putObject("match").put("integer", tenantId);
        ObjectNode publicCond = should.addObject();
        publicCond.put("key", "tenant_id");
        publicCond.putObject("match").put("integer", 0);
        return filter;
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

            // 中文单字符索引（v1 行为，v2 关闭）：
            // "的/是/在"这类字在几乎所有文档里都出现，只有 TF 没有 IDF 的情况下纯属噪声，
            // 会拉低款号/色号这类真正有区分度的 token 的相对权重。
            if (!sparseV2) {
                for (int i = 0; i < trimmed.length(); i++) {
                    char c = trimmed.charAt(i);
                    if (isChineseChar(c)) {
                        termFreq.merge(String.valueOf(c), 1, Integer::sum);
                    }
                }
            }

            if (termFreq.isEmpty()) return null;

            // 找最大词频用于归一化
            int maxFreq = termFreq.values().stream().mapToInt(Integer::intValue).max().orElse(1);

            // 构建 SparseVector
            SparseVector sv = new SparseVector();
            for (Map.Entry<String, Integer> entry : termFreq.entrySet()) {
                // v1：hashCode() % 100000 + 1 —— 只有 10 万个桶，中文 bigram 极易撞桶，
                //     两个语义无关的词共用一个 index 会直接导致错误匹配（款号/色号撞桶即精确检索失效）。
                // v2：hashCode() & 0x7FFFFFFF —— 31 位正整数（Qdrant sparse index 要求非负 32 位整数），
                //     冲突概率从"必然"降到极低。
                int tokenId = sparseV2
                        ? (entry.getKey().hashCode() & 0x7FFFFFFF)
                        : (Math.abs(entry.getKey().hashCode()) % 100000 + 1);
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
            idCond.putObject("match").put("value", toPointId(pointId));
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
        if (!qdrantActive()) return false;
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
        if (!qdrantActive()) return false;
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

    /**
     * Qdrant 点 ID 只接受无符号整数或 UUID——业务字符串 ID（表名/记忆id/缓存key等）
     * 确定性转为 UUID（同一字符串恒得同一 UUID，写入与删除天然对上）；
     * 本身已是 UUID 的原样返回（搜索结果回查场景）。
     */
    private static String toPointId(String raw) {
        if (raw == null || raw.isEmpty()) {
            return raw;
        }
        if (raw.length() == 36 && raw.toLowerCase().matches(
                "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
            return raw.toLowerCase();
        }
        return java.util.UUID.nameUUIDFromBytes(
                raw.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
    }

    private void ensureCollectionExists() {
        if (collectionVerified.get()) return;
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
            collectionVerified.set(true);
            detectVectorMode(resp.getBody());
            return;
        } catch (Exception e) {
            log.debug("[Qdrant] 集合 {} 不存在，尝试自动创建", collectionName);
        }

        boolean created = false;
        if (namedVectorsEnabled) {
            // 命名向量模式：dense("") + sparse("text-sparse") 才能共存于同一个点
            created = tryCreateCollection(true, true)
                    || tryCreateCollection(true, false);
        }
        if (!created) {
            // 未命名模式（默认）：与改造前完全一致的创建顺序
            created = tryCreateCollection(false, true)
                    || tryCreateCollection(false, false);
            if (created) {
                // 未命名 dense 集合里 sparse 无法写入同一个点，混合检索不可用
                hybridSearchDegraded.set(true);
            }
        }
        if (!created) {
            log.warn("[Qdrant] 集合 {} 创建失败", collectionName);
        }
    }

    /**
     * 按指定形态创建集合。
     *
     * @param named      是否命名向量模式（vectors: {"": {...}}）；false 为未命名（vectors: {size, distance}）
     * @param withSparse 是否声明 sparse_vectors
     */
    private boolean tryCreateCollection(boolean named, boolean withSparse) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode vectors = body.putObject("vectors");
            ObjectNode denseParams = named ? vectors.putObject(DENSE_VECTOR_NAME) : vectors;
            denseParams.put("size", getVectorDim());
            denseParams.put("distance", "Cosine");
            if (withSparse) {
                body.putObject("sparse_vectors").putObject(SPARSE_VECTOR_NAME);
            }
            // Qdrant REST 创建集合必须用 PUT（POST 该路径 404），2026-09-13 首次真实连通时暴露
            restTemplate.exchange(
                    qdrantUrl + "/collections/" + collectionName,
                    HttpMethod.PUT, jsonEntity(body.toString()), String.class);
            namedVectorMode = named;
            sparseWriteEnabled = named && withSparse;
            collectionVerified.set(true);
            log.info("[Qdrant] 集合 {} 已自动创建（named={} sparse={}）", collectionName, named, sparseWriteEnabled);
            return true;
        } catch (Exception e) {
            log.warn("[Qdrant] 集合创建失败（named={} sparse={}）: {}", named, withSparse, e.getMessage());
            return false;
        }
    }

    /**
     * 探测集合真实的向量形态：未命名 dense（{size, distance}）还是命名向量（{"": {...}}），
     * 并据此判断 sparse 是否可写。集合可能由旧版本代码创建，不能只信配置开关。
     */
    private void detectVectorMode(String responseBody) {
        try {
            if (responseBody == null) return;
            JsonNode params = objectMapper.readTree(responseBody)
                    .path("result").path("config").path("params");
            JsonNode vectors = params.path("vectors");
            // 未命名模式解析出来是 {size, distance}；命名模式是 {"": {size, distance}, ...}
            boolean named = vectors.isObject() && !vectors.has("size");
            namedVectorMode = named;
            sparseWriteEnabled = named && params.path("sparse_vectors").has(SPARSE_VECTOR_NAME);
            log.info("[Qdrant] 集合 {} 向量形态探测: named={} sparse可写={}",
                    collectionName, named, sparseWriteEnabled);
            if (!sparseWriteEnabled) {
                log.info("[Qdrant] 集合 {} 暂不支持 sparse：混合检索走纯稠密。"
                        + "需新建命名向量集合（intelligence.qdrant.named-vectors=true + 新集合名）后重灌数据",
                        collectionName);
            }
        } catch (Exception e) {
            log.debug("[Qdrant] 集合向量形态探测失败，按未命名 dense 处理: {}", e.getMessage());
            namedVectorMode = Boolean.FALSE;
            sparseWriteEnabled = false;
        }
    }

    /**
     * 生成语义向量：DeepSeek Embedding → 伪向量（降级）。
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
        if (!embeddingRemoteBroken && hasRealEmbeddingProvider()) {
            try {
                float[] vector = callEmbeddingApi(text);
                embeddingCache.put(cacheKey, new EmbeddingCacheEntry(vector));
                evictCacheIfNeeded();
                return vector;
            } catch (Exception e) {
                log.warn("[Qdrant] Embedding API 调用失败，降级为伪向量: {}", e.getMessage());
                // 404=接口不存在（DeepSeek）；401=密钥被拒（配错/失效）——都不会自愈，本次运行内熔断不再重试
                String msg = String.valueOf(e.getMessage());
                if (msg.contains("404") || msg.contains("401")) {
                    embeddingRemoteBroken = true;
                    log.warn("[Qdrant] Embedding 接口不可用({})，已熔断：本次运行内直接使用伪向量。404=接口不存在，401=检查 AI_EMBEDDING_API_KEY 密钥", msg);
                }
            }
        }
        return pseudoEmbedding(text);
    }

    /** 是否配置了可用的真实 Embedding 提供方（独立配置优先，回落 DeepSeek Key） */
    private boolean hasRealEmbeddingProvider() {
        return (embeddingApiKey != null && !embeddingApiKey.isEmpty())
                || (deepseekApiKey != null && !deepseekApiKey.isEmpty());
    }

    /**
     * 当前实际生效的 Embedding 提供方标签（日志用）。
     * 历史教训：日志里写死「DeepSeek Embedding」，而实际跑的是硅基流动 bge-m3，排查时被严重误导。
     */
    private String activeEmbeddingLabel() {
        boolean useStandalone = embeddingApiKey != null && !embeddingApiKey.isEmpty();
        return useStandalone
                ? embeddingModelName + "@" + embeddingBaseUrl
                : "deepseek:" + embeddingModel + "@" + deepseekBaseUrl;
    }

    private String resolveActiveProvider() {
        if (deepseekApiKey != null && !deepseekApiKey.isEmpty()) {
            log.debug("[Qdrant] Embedding provider=DEEPSEEK (key长度={})", deepseekApiKey.length());
            return PROVIDER_DEEPSEEK;
        }
        log.warn("[Qdrant] Embedding provider=PSEUDO (deepseekApiKey={})",
                deepseekApiKey == null ? "null" : (deepseekApiKey.isEmpty() ? "empty" : "set"));
        return "pseudo";
    }

    private void evictCacheIfNeeded() {
        if (embeddingCache.size() > EMBEDDING_CACHE_MAX) {
            embeddingCache.entrySet().removeIf(e -> e.getValue().isExpired());
        }
    }

    /**
     * 调用 OpenAI 兼容 Embedding API 获取真实语义向量。
     * 独立配置（ai.embedding.*，推荐硅基流动 bge-m3=1024维）优先；未配置时回落 DeepSeek（无 embeddings 接口，必然 404）。
     */
    private float[] callEmbeddingApi(String text) {
        boolean useStandalone = embeddingApiKey != null && !embeddingApiKey.isEmpty();
        String apiKey = useStandalone ? embeddingApiKey : deepseekApiKey;
        String baseUrl = useStandalone ? embeddingBaseUrl : deepseekBaseUrl;
        String model = useStandalone ? embeddingModelName : embeddingModel;
        if (embeddingKeyFingerprintLogged.compareAndSet(false, true)) {
            log.info("[Qdrant] Embedding 提供方={} key指纹={}...{} 长度={} 模型={} url={}",
                    useStandalone ? "standalone(ai.embedding.*)" : "deepseek回落",
                    apiKey.substring(0, Math.min(5, apiKey.length())),
                    apiKey.substring(Math.max(5, apiKey.length() - 3)),
                    apiKey.length(), model, baseUrl);
        }
        String url = baseUrl + embeddingPath;
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", model);
        body.put("input", text);
        // Voyage 只接受 base64（float 会被 400 拒绝）；不认此参数的提供方留空则整个省略
        if (embeddingEncodingFormat != null && !embeddingEncodingFormat.isEmpty()) {
            body.put("encoding_format", embeddingEncodingFormat);
        }
        if (embeddingDimensions > 0) {
            body.put("dimensions", embeddingDimensions);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);
        HttpEntity<String> entity = new HttpEntity<>(body.toString(), headers);

        ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);
        if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
            JsonNode root;
            try {
                root = objectMapper.readTree(resp.getBody());
            } catch (Exception e) {
                throw new RuntimeException("Embedding response parse failed", e);
            }
            JsonNode item = root.path("data").path(0);
            JsonNode embedding = item.path("embedding");
            if (embedding.isArray()) {
                float[] vec = new float[embedding.size()];
                for (int i = 0; i < embedding.size(); i++) {
                    vec[i] = (float) embedding.get(i).asDouble();
                }
                log.debug("[Qdrant] 真实语义向量生成成功，维度={}", vec.length);
                return vec;
            }
            // base64 编码格式（Voyage 风格）：data[0].data 为 little-endian float32 的 base64
            JsonNode b64 = item.path("data");
            if (b64.isTextual() && !b64.asText().isEmpty()) {
                byte[] bytes = java.util.Base64.getDecoder().decode(b64.asText());
                float[] vec = new float[bytes.length / 4];
                java.nio.ByteBuffer.wrap(bytes)
                        .order(java.nio.ByteOrder.LITTLE_ENDIAN)
                        .asFloatBuffer().get(vec);
                log.debug("[Qdrant] 真实语义向量生成成功(base64)，维度={}", vec.length);
                return vec;
            }
        }
        throw new RuntimeException("Embedding API returned unexpected response");
    }

    /** 获取当前使用的向量维度（DeepSeek 为 1024 维，伪向量 128 维） */
    private int getVectorDim() {
        // 同 computeMultimodalEmbedding：独立配置 ai.embedding.* 也能出真实向量，不能只看 deepseekApiKey。
        // 原判定在只配 standalone key 时返回 128（伪向量维度），与实际生成的 1024 不符 → 建集合维度会错。
        return hasRealEmbeddingProvider() ? VECTOR_DIM_REAL : VECTOR_DIM_PSEUDO;
    }

    /**
     * 公开诊断方法 — 返回 DeepSeek 向量配置状态，用于 /visual/diag 端点排查问题
     */
    public Map<String, Object> getVectorDimInfo() {
        Map<String, Object> info = new java.util.LinkedHashMap<>();
        boolean hasDeepSeek = deepseekApiKey != null && !deepseekApiKey.isEmpty();
        boolean hasInferenceOrch = inferenceOrchestrator != null;
        info.put("hasDeepSeekKey", hasDeepSeek);
        info.put("deepseekBaseUrl", deepseekBaseUrl);
        info.put("deepseekEmbeddingModel", embeddingModel);
        info.put("hasInferenceOrchestrator", hasInferenceOrch);
        // 真实生效的 Embedding 提供方（线上为硅基流动 bge-m3，光看上面几个 DeepSeek 字段会被误导）
        info.put("hasRealEmbedding", hasRealEmbeddingProvider());
        info.put("embeddingProvider", activeEmbeddingLabel());
        info.put("embeddingBaseUrl", embeddingBaseUrl);
        info.put("embeddingModelName", embeddingModelName);
        info.put("embeddingPath", embeddingPath);
        info.put("embeddingDimensions", embeddingDimensions);
        info.put("currentVectorDim", getVectorDim());
        info.put("realVectorDim", VECTOR_DIM_REAL);
        info.put("pseudoVectorDim", VECTOR_DIM_PSEUDO);
        if (hasDeepSeek && hasInferenceOrch) {
            info.put("recommendedMode", "vision_describe_and_embedding (最佳质量)");
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
     * <p>向量生成优先级（D-361：全站统一 deepseek-flash 多模态）：
     * 1. 主模型视觉分析 + Embedding（图片→描述→向量，质量最佳）
     * 2. 纯文本 Embedding（用图片 URL 文本生成向量，质量一般）
     * 3. 伪向量（哈希）— 最低质量，仅兜底
     */
    /** 文本语义向量（供"以图搜款描述→向量"等场景复用 embedding 通道）。失败返回 null。 */
    public float[] embedText(String text) {
        if (!qdrantActive() || text == null || text.isBlank()) return null;
        try {
            return callEmbeddingApi(text);
        } catch (Exception e) {
            log.warn("[Qdrant] 文本向量化失败: {}", e.getMessage());
            return null;
        }
    }

    public float[] computeMultimodalEmbedding(String imageUrl) {        if (!qdrantActive()) return null;
        if (imageUrl == null || imageUrl.isBlank()) {
            throw new IllegalArgumentException("imageUrl 不能为空");
        }

        // 不能只判 deepseekApiKey：callEmbeddingApi 优先用独立配置 ai.embedding.*，
        // 只配 standalone key 时同样能出真实向量。原判定会让它静默降级伪向量（搜索质量掉地上无感知）。
        boolean hasRealEmbedding = hasRealEmbeddingProvider();
        boolean hasInferenceOrch = inferenceOrchestrator != null;
        log.info("[Qdrant] 向量生成启动 imageUrlLen={} hasRealEmbedding={} hasInferenceOrch={} embedding={}",
                imageUrl.length(), hasRealEmbedding, hasInferenceOrch, activeEmbeddingLabel());

        // ========== 第 1 级：主模型（多模态）视觉分析 → 文字描述 → Embedding ==========
        if (hasInferenceOrch) {
            try {
                log.info("[Qdrant] 尝试方案1: 主模型视觉描述 + Embedding({})", activeEmbeddingLabel());
                String visualDescription = describeImageWithVision(imageUrl);
                if (visualDescription != null && !visualDescription.isBlank()) {
                    log.info("[Qdrant] 视觉描述成功 descLen={}", visualDescription.length());
                    if (hasRealEmbedding) {
                        float[] vec = callEmbeddingApi(visualDescription);
                        log.info("[Qdrant] ✓ 方案1成功 视觉描述+Embedding({}) 维度={}", activeEmbeddingLabel(), vec.length);
                        return vec;
                    }
                    log.warn("[Qdrant] 已获取视觉描述但未配置任何 Embedding Key（ai.embedding.api-key 或 DEEPSEEK_API_KEY），无法生成向量");
                } else {
                    log.warn("[Qdrant] 视觉描述返回空");
                }
            } catch (Exception e) {
                log.warn("[Qdrant] 视觉描述+Embedding 失败: {}", e.getMessage());
            }
        }

        // ========== 第 2 级：纯文本 Embedding（用图片 URL 文本生成向量） ==========
        if (hasRealEmbedding) {
            log.info("[Qdrant] 尝试方案2: 文本 Embedding({})（用 imageUrl 文本）", activeEmbeddingLabel());
            try {
                float[] vec = callEmbeddingApi(imageUrl);
                log.info("[Qdrant] ✓ 方案2成功 文本 Embedding({}) 维度={}", activeEmbeddingLabel(), vec.length);
                return vec;
            } catch (Exception e) {
                log.warn("[Qdrant] Embedding({}) 失败: {}", activeEmbeddingLabel(), e.getMessage());
            }
        }

        // ========== 第 3 级：伪向量兜底 ==========
        log.warn("[Qdrant] Embedding 降级为伪向量（搜索质量降低但不影响功能）" +
                "当前配置: hasRealEmbedding={}。" +
                "如需高质量向量搜索：请配置 ai.embedding.api-key（推荐硅基流动 bge-m3）或 DEEPSEEK_API_KEY",
                hasRealEmbedding);
        return pseudoEmbedding(imageUrl);
    }

    /**
     * 用主模型（多模态）对图片生成文字描述，用于后续 Embedding。
     * 这比直接用图片 URL 做 Embedding 质量高得多，因为模型能理解图片内容。
     */
    private String describeImageWithVision(String imageUrl) {
        try {
            String desc = inferenceOrchestrator.chatWithVision(imageUrl,
                    "请用50字以内简洁描述这件服装的款式特征（领型、袖型、版型、面料质感、装饰工艺），"
                            + "仅描述可见的工艺特征，不评价颜色和风格。");
            if (desc != null && !desc.isBlank()) {
                return desc.length() > 200 ? desc.substring(0, 200) : desc;
            }
        } catch (Exception e) {
            log.debug("[Qdrant] 视觉描述失败: {}", e.getMessage());
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
            logQdrantConnFail("style_images upsert", "styleId=" + styleId + " " + e.getMessage());
            return false;
        }
    }

    /**
     * 搜索视觉相似的历史款式（仅在 style_images 集合中检索）。
     */
    public List<SimilarStyle> searchSimilarStyleImages(float[] embedding, int topK, Long tenantId) {
        if (!qdrantActive()) return Collections.emptyList();
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
            logQdrantConnFail("style_images search", e.getMessage());
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
            // Qdrant 创建集合必须 PUT（POST 该路径 404），同 fashion_memory 修复
            restTemplate.exchange(
                    qdrantUrl + "/collections/" + STYLE_IMAGE_COLLECTION,
                    HttpMethod.PUT, jsonEntity(body.toString()), String.class);
            log.info("[Qdrant] 集合 {} 已自动创建", STYLE_IMAGE_COLLECTION);
            styleImageCollectionVerified.set(true);
        } catch (Exception ex) {
            logQdrantConnFail("style_images集合创建", ex.getMessage());
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
        if (!qdrantActive()) return false;
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
                // Qdrant 创建集合必须 PUT（POST 该路径 404）
                restTemplate.exchange(
                        qdrantUrl + "/collections/" + collection,
                        HttpMethod.PUT, jsonEntity(body.toString()), String.class);
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
        if (!qdrantActive()) return false;
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
            point.put("id", toPointId(pointId));
            point.set("vector", toJsonArray(vector));

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
            // upsert 端点是 PUT，POST 会 404
            restTemplate.exchange(url, HttpMethod.PUT, jsonEntity(body.toString()), String.class);
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
        if (!qdrantActive()) return List.of();
        if (tenantId == null || queryText == null || queryText.isBlank()) return List.of();
        if (topK <= 0 || topK > 50) topK = 5;

        ensureArchivalCollection(tenantId);

        try {
            float[] vector = computeEmbedding(queryText);
            if (vector == null) return List.of();

            ObjectNode body = objectMapper.createObjectNode();
            body.set("vector", toJsonArray(vector));
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
                restoreOriginalId(sp);
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
        if (!qdrantActive()) return List.of();
        if (tenantId == null || queryText == null || queryText.isBlank()) return List.of();
        if (topK <= 0 || topK > 50) topK = 5;

        ensureArchivalCollection(tenantId);

        try {
            float[] vector = computeEmbedding(queryText);
            if (vector == null) return List.of();

            ObjectNode body = objectMapper.createObjectNode();
            body.set("vector", toJsonArray(vector));
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
                restoreOriginalId(sp);
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
        if (!qdrantActive()) return List.of();
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
        if (!qdrantActive()) return result;
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
        if (!qdrantActive()) return false;
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
