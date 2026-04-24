package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * Cohere Rerank API 精排服务
 * <p>
 * 对 RAG 混合初检结果进行二次精排，将候选 15 条压缩为最相关的 5 条。
 * 未配置 API Key 或网络异常时自动降级，返回混合评分原始顺序。
 *
 * <p>配置开关（application.yml）：
 * <pre>
 * ai:
 *   cohere:
 *     rerank:
 *       enabled: true          # 设为 true 并配置 api-key 方可生效
 *       api-key: ${COHERE_API_KEY:}
 * </pre>
 */
@Slf4j
@Service
public class CohereRerankService {

    @Value("${ai.cohere.rerank.enabled:false}")
    private boolean enabled;

    @Value("${ai.cohere.rerank.api-key:}")
    private String apiKey;

    @Value("${ai.cohere.rerank.model:rerank-v3.5}")
    private String model;

    private static final String COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
    private static final int REQUEST_TIMEOUT_MS = 8000;

    private final RestTemplate restTemplate;

    public CohereRerankService() {
        this.restTemplate = new RestTemplate();
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(REQUEST_TIMEOUT_MS);
        factory.setReadTimeout(REQUEST_TIMEOUT_MS);
        this.restTemplate.setRequestFactory(factory);
    }

    /** 判断是否可用（已启用且 API Key 非空） */
    public boolean isAvailable() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }

    /**
     * 对候选 KnowledgeBase 列表执行 Cohere 精排
     *
     * @param query      用户原始查询
     * @param candidates 候选文档列表（通常 10-15 条，由混合初排提供）
     * @param topN       精排后返回条数（通常 5）
     * @return 精排后的 KnowledgeBase 列表；失败时返回原始 candidates 前 topN 条
     */
    public List<KnowledgeBase> rerank(String query, List<KnowledgeBase> candidates, int topN) {
        if (candidates == null || candidates.isEmpty()) return Collections.emptyList();
        int actualTopN = Math.min(topN, candidates.size());

        try {
            // 构建 documents 列表（title + keywords + content 拼接，提升语义覆盖）
            List<Map<String, String>> documents = new ArrayList<>(candidates.size());
            for (KnowledgeBase kb : candidates) {
                String title = kb.getTitle() != null ? kb.getTitle() : "";
                String keywords = kb.getKeywords() != null ? kb.getKeywords() : "";
                String content = kb.getContent() != null ? kb.getContent() : "";
                if (content.length() > 500) {
                    content = content.substring(0, 500);
                }
                String text = title + "\n" + keywords + "\n" + content;
                documents.add(Map.of("text", text));
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("query", query);
            body.put("documents", documents);
            body.put("top_n", actualTopN);
            body.put("return_documents", false);  // 仅返回 index + score，节省带宽

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

                ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    COHERE_RERANK_URL,
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    new ParameterizedTypeReference<>() {});

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.warn("[CohereRerank] 响应异常 status={}", response.getStatusCode());
                return candidates.subList(0, actualTopN);
            }

            List<Map<String, Object>> results = toObjectMapList(response.getBody().get("results"));
            if (results == null || results.isEmpty()) {
                return candidates.subList(0, actualTopN);
            }

            // 按 Cohere 返回顺序（relevance_score 降序）重建 KnowledgeBase 列表
            List<KnowledgeBase> reranked = new ArrayList<>(results.size());
            for (Map<String, Object> r : results) {
                int index = ((Number) r.get("index")).intValue();
                if (index >= 0 && index < candidates.size()) {
                    reranked.add(candidates.get(index));
                }
            }
            log.debug("[CohereRerank] 精排完成 {} → {} 条", candidates.size(), reranked.size());
            return reranked;

        } catch (Exception e) {
            log.warn("[CohereRerank] 精排失败，降级返回混合评分顺序: {}", e.getMessage());
            return candidates.subList(0, actualTopN);
        }
    }

    private List<Map<String, Object>> toObjectMapList(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return null;
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof Map<?, ?> rawMap) {
                Map<String, Object> converted = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    if (entry.getKey() instanceof String key) {
                        converted.put(key, entry.getValue());
                    }
                }
                results.add(converted);
            }
        }
        return results;
    }
}
