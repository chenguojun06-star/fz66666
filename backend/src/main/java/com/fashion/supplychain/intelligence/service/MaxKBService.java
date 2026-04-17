package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

/**
 * MaxKB 企业知识库接入服务
 *
 * <p>通过 MaxKB REST API 实现问答和知识检索。
 * MaxKB 是基于大模型的企业私有知识库产品，支持多种文档格式。
 *
 * <p>配置项（application.yml）：
 * <pre>
 * intelligence:
 *   maxkb:
 *     base-url: http://localhost:8080
 *     api-key: your-api-key
 *     application-id: your-app-id
 *     dataset-id: your-dataset-id
 * </pre>
 *
 * <p>MaxKB 未配置时所有方法优雅降级，不抛异常。
 */
@Service
@Slf4j
public class MaxKBService {

    @Value("${intelligence.maxkb.base-url:}")
    private String baseUrl;

    @Value("${intelligence.maxkb.api-key:}")
    private String apiKey;

    @Value("${intelligence.maxkb.application-id:}")
    private String applicationId;

    @Value("${intelligence.maxkb.dataset-id:}")
    private String datasetId;

    @Autowired
    private ObjectMapper objectMapper;

    private final RestTemplate restTemplate = new RestTemplate();

    // ──────────────────────────────────────────────────────────────
    //  公开接口
    // ──────────────────────────────────────────────────────────────

    /** MaxKB 是否已启用（base-url 已配置） */
    public boolean isEnabled() {
        return StringUtils.hasText(baseUrl) && StringUtils.hasText(apiKey);
    }

    /**
     * 向 MaxKB 应用发起一次问答。
     * 使用 conversation 接口（非流式），适合后台 AI 分析场景。
     *
     * @param question 问题内容
     * @return AI 回答文本，失败时返回 null
     */
    public String ask(String question) {
        if (!isEnabled()) return null;
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("message", question);
            body.put("stream", false);
            body.put("re_chat", false);
            body.put("application_id", applicationId);

            String url = baseUrl + "/api/application/chat_message";
            HttpEntity<String> entity = buildEntity(body.toString());
            String resp = restTemplate.postForObject(url, entity, String.class);
            if (resp != null) {
                JsonNode root = objectMapper.readTree(resp);
                JsonNode content = root.path("data").path("content");
                if (!content.isMissingNode()) return content.asText();
            }
        } catch (Exception e) {
            log.warn("[MaxKB] ask失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 在 MaxKB 数据集中检索相关段落。
     *
     * @param query 检索词
     * @param topK  返回条数
     * @return 段落内容列表
     */
    public List<String> searchKnowledge(String query, int topK) {
        List<String> results = new ArrayList<>();
        if (!isEnabled() || !StringUtils.hasText(datasetId)) return results;
        try {
            String url = baseUrl + "/api/dataset/" + datasetId
                    + "/paragraph/search?query=" + java.net.URLEncoder.encode(query, "UTF-8")
                    + "&top_n=" + topK;
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "Bearer " + apiKey);
            headers.setContentType(MediaType.APPLICATION_JSON);

            String resp = restTemplate.getForObject(url, String.class);
            if (resp != null) {
                JsonNode root = objectMapper.readTree(resp);
                JsonNode data = root.path("data");
                if (data.isArray()) {
                    for (JsonNode item : data) {
                        String content = item.path("content").asText("");
                        if (!content.isBlank()) results.add(content);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[MaxKB] searchKnowledge失败: {}", e.getMessage());
        }
        return results;
    }

    /**
     * 向 MaxKB 数据集添加一段知识（用于系统自学习写入）。
     *
     * @param title   段落标题
     * @param content 段落内容
     * @return 写入成功则返回段落ID，否则 null
     */
    public String addKnowledge(String title, String content) {
        if (!isEnabled() || !StringUtils.hasText(datasetId)) return null;
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("title", title);
            body.put("content", content);
            body.put("is_active", true);

            String url = baseUrl + "/api/dataset/" + datasetId + "/document/paragraph";
            HttpEntity<String> entity = buildEntity(body.toString());
            String resp = restTemplate.postForObject(url, entity, String.class);
            if (resp != null) {
                JsonNode root = objectMapper.readTree(resp);
                return root.path("data").path("id").asText(null);
            }
        } catch (Exception e) {
            log.warn("[MaxKB] addKnowledge失败: {}", e.getMessage());
        }
        return null;
    }

    // ──────────────────────────────────────────────────────────────
    //  内部工具
    // ──────────────────────────────────────────────────────────────

    private HttpEntity<String> buildEntity(String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (StringUtils.hasText(apiKey)) {
            headers.set("Authorization", "Bearer " + apiKey);
        }
        return new HttpEntity<>(json, headers);
    }
}
