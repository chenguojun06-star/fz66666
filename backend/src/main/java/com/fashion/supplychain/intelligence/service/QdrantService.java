package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * Qdrant 向量库接入服务
 *
 * <p>通过 Qdrant REST API v1.x 实现向量存储与相似检索。
 * 每个租户使用同一个 collection，通过 tenant_id payload 过滤隔离。
 *
 * <p>向量生成：优先调用 DeepSeek Embedding API（1024维）生成真实语义向量，
 * 不可用时降级为关键词哈希（pseudoEmbedding，128维）。
 *
 * <p>配置项（application.yml）：
 * <pre>
 * intelligence:
 *   qdrant:
 *     url: http://localhost:6333
 *     collection: fashion_memory
 *     vector-size: 1024
 * ai:
 *   deepseek:
 *     api-key: sk-xxx
 *     embedding-model: text-embedding-v2
 * </pre>
 */
@Service
@Slf4j
public class QdrantService {

    private static final String COLLECTION_DEFAULT = "fashion_memory";
    private static final int VECTOR_DIM_REAL = 1024;
    private static final int VECTOR_DIM_PSEUDO = 128;

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

    @Autowired
    private ObjectMapper objectMapper;

    private final RestTemplate restTemplate = new RestTemplate();

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
        try {
            ensureCollectionExists();
            float[] vector = computeEmbedding(content);

            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode points = body.putArray("points");
            ObjectNode point = points.addObject();
            point.put("id", Long.parseLong(pointId));

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
        List<ScoredPoint> results = new ArrayList<>();
        try {
            float[] vector = computeEmbedding(queryText);

            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode vec = body.putArray("vector");
            for (float v : vector) {
                vec.add(v);
            }
            body.put("limit", topK);
            body.put("with_payload", true);

            // 租户隔离过滤
            ObjectNode filter = body.putObject("filter");
            ArrayNode must = filter.putArray("must");
            ObjectNode cond = must.addObject();
            ObjectNode field = cond.putObject("key");
            field.put("key", "tenant_id");   // workaround: Qdrant match表达式
            ObjectNode matchVal = cond.putObject("match");
            matchVal.put("integer", tenantId);

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
                        results.add(sp);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Qdrant] search失败 tenantId={}: {}", tenantId, e.getMessage());
        }
        return results;
    }

    /** 删除指定向量点 */
    public void deleteVector(String pointId) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode points = body.putObject("points");
            ArrayNode ids = points.putArray("values");
            ids.add(Long.parseLong(pointId));

            String url = qdrantUrl + "/collections/" + collectionName + "/points/delete";
            restTemplate.exchange(url, HttpMethod.POST, jsonEntity(body.toString()), String.class);
        } catch (Exception e) {
            log.warn("[Qdrant] delete失败 pointId={}: {}", pointId, e.getMessage());
        }
    }

    public boolean isAvailable() {
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(
                    qdrantUrl + "/healthz", String.class);
            return resp.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            return false;
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  内部工具
    // ──────────────────────────────────────────────────────────────

    private void ensureCollectionExists() {
        try {
            restTemplate.getForEntity(
                    qdrantUrl + "/collections/" + collectionName, String.class);
        } catch (Exception e) {
            // collection 不存在，自动创建
            try {
                ObjectNode body = objectMapper.createObjectNode();
                ObjectNode params = body.putObject("vectors");
                params.put("size", getVectorDim());
                params.put("distance", "Cosine");
                restTemplate.postForEntity(
                        qdrantUrl + "/collections/" + collectionName,
                        jsonEntity(body.toString()), String.class);
                log.info("[Qdrant] 集合 {} 已自动创建", collectionName);
            } catch (Exception ex) {
                log.warn("[Qdrant] 集合创建失败: {}", ex.getMessage());
            }
        }
    }

    /**
     * 生成语义向量：优先调用 DeepSeek Embedding API，不可用时降级为伪向量。
     */
    private float[] computeEmbedding(String text) {
        if (text == null || text.isEmpty()) {
            return new float[getVectorDim()];
        }
        if (deepseekApiKey != null && !deepseekApiKey.isEmpty()) {
            try {
                return callEmbeddingApi(text);
            } catch (Exception e) {
                log.warn("[Qdrant] DeepSeek Embedding API 调用失败，降级为伪向量: {}", e.getMessage());
            }
        }
        return pseudoEmbedding(text);
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

    /** 获取当前使用的向量维度 */
    private int getVectorDim() {
        return (deepseekApiKey != null && !deepseekApiKey.isEmpty()) ? VECTOR_DIM_REAL : VECTOR_DIM_PSEUDO;
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
    //  内嵌 DTO
    // ──────────────────────────────────────────────────────────────

    @lombok.Data
    public static class ScoredPoint {
        private String pointId;
        private float score;
    }
}
