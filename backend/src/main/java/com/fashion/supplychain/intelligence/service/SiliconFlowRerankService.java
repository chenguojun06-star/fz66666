package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 硅基流动（SiliconFlow）Rerank API 精排服务
 * <p>
 * 使用 BAAI/bge-reranker-v2-m3（与现用 bge-m3 embedding 同源），国内直连。
 * 用于替换/补充 Cohere：Cohere 在国内访问不稳定且无免费额度。
 *
 * <p>接口文档要点：
 * <ul>
 *   <li>{@code POST {base-url}/v1/rerank}</li>
 *   <li>documents 为<b>字符串数组</b>（区别于 Cohere 的 {@code [{"text": "..."}]}）</li>
 *   <li>响应 {@code results} 按 relevance_score 降序，{@code index} 为 documents 原始下标</li>
 * </ul>
 *
 * <p>失败（超时/非2xx/解析异常）一律静默降级返回原排序，绝不影响主链路。
 *
 * <p>配置（application.yml）：
 * <pre>
 * ai:
 *   rerank:
 *     api-key: ${AI_RERANK_API_KEY:${AI_EMBEDDING_API_KEY:}}
 *     model: BAAI/bge-reranker-v2-m3
 *     base-url: https://api.siliconflow.cn
 *     timeout-ms: 3000
 * </pre>
 */
@Slf4j
@Service
@Lazy
public class SiliconFlowRerankService {

    @Value("${ai.rerank.api-key:${AI_EMBEDDING_API_KEY:}}")
    private String apiKey;

    @Value("${ai.rerank.model:BAAI/bge-reranker-v2-m3}")
    private String model;

    @Value("${ai.rerank.base-url:https://api.siliconflow.cn}")
    private String baseUrl;

    @Value("${ai.rerank.timeout-ms:3000}")
    private int timeoutMs;

    private RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    void initRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(timeoutMs);
        factory.setReadTimeout(timeoutMs);
        this.restTemplate = new RestTemplate(factory);
    }

    /** 判断是否可用（API Key 已配置） */
    public boolean isAvailable() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 对候选 KnowledgeBase 列表执行硅基流动精排
     *
     * @param query      用户（已改写）查询
     * @param candidates 候选文档列表
     * @param topN       精排后返回条数
     * @return 精排后的列表；失败时返回 candidates 前 topN 条（原排序）
     */
    public List<KnowledgeBase> rerank(String query, List<KnowledgeBase> candidates, int topN) {
        if (candidates == null || candidates.isEmpty()) return Collections.emptyList();
        int actualTopN = Math.min(topN, candidates.size());

        if (!isAvailable()) {
            return candidates.subList(0, actualTopN);
        }

        long start = System.currentTimeMillis();
        try {
            List<String> documents = new ArrayList<>(candidates.size());
            for (KnowledgeBase kb : candidates) {
                documents.add(buildDocumentText(kb));
            }

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("query", query);
            body.put("documents", documents);
            body.put("top_n", actualTopN);
            body.put("return_documents", false);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            ResponseEntity<String> response = restTemplate.exchange(
                    baseUrl + "/v1/rerank",
                    HttpMethod.POST,
                    new HttpEntity<>(objectMapper.writeValueAsString(body), headers),
                    String.class);

            long costMs = System.currentTimeMillis() - start;

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.warn("[SiliconFlowRerank] 响应异常 status={} 耗时={}ms，降级原排序",
                        response.getStatusCode(), costMs);
                return candidates.subList(0, actualTopN);
            }

            JsonNode results = objectMapper.readTree(response.getBody()).path("results");
            if (!results.isArray() || results.isEmpty()) {
                log.warn("[SiliconFlowRerank] results 为空 耗时={}ms，降级原排序", costMs);
                return candidates.subList(0, actualTopN);
            }

            List<KnowledgeBase> reranked = new ArrayList<>(results.size());
            for (JsonNode r : results) {
                int index = r.path("index").asInt(-1);
                if (index >= 0 && index < candidates.size()) {
                    reranked.add(candidates.get(index));
                }
            }
            if (reranked.isEmpty()) {
                log.warn("[SiliconFlowRerank] 无有效 index 耗时={}ms，降级原排序", costMs);
                return candidates.subList(0, actualTopN);
            }

            log.info("[SiliconFlowRerank] 精排完成 candidates={} → {} 条, 耗时={}ms",
                    candidates.size(), reranked.size(), costMs);
            return reranked;

        } catch (Exception e) {
            log.warn("[SiliconFlowRerank] 精排失败，降级返回原排序: candidates={} 耗时={}ms err={}",
                    candidates.size(), System.currentTimeMillis() - start, e.getMessage());
            return candidates.subList(0, actualTopN);
        }
    }

    /** 与 CohereRerankService 保持一致：title + keywords + content(截断500) 提升语义覆盖 */
    private String buildDocumentText(KnowledgeBase kb) {
        String title = kb.getTitle() != null ? kb.getTitle() : "";
        String keywords = kb.getKeywords() != null ? kb.getKeywords() : "";
        String content = kb.getContent() != null ? kb.getContent() : "";
        if (content.length() > 500) {
            content = content.substring(0, 500);
        }
        return title + "\n" + keywords + "\n" + content;
    }
}
