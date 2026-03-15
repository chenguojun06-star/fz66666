package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;

/**
 * Langfuse Trace 推送编排器。
 *
 * <p>职责：将每次 AI 推理结果异步推送至 Langfuse server，生成可追踪 trace。
 * {@link IntelligenceObservabilityOrchestrator} 负责写本地 DB 度量，
 * 本编排器专门负责向外部 Langfuse 平台推送 trace 事件。
 *
 * <p>推送方式：Langfuse Ingestion API v1
 * {@code POST {endpoint}/api/public/ingestion}，Basic Auth（publicKey:secretKey）。
 *
 * <p>配置项：
 * <pre>
 * ai:
 *   observability:
 *     endpoint: ${AI_OBSERVABILITY_ENDPOINT}   # Langfuse server（如 https://cloud.langfuse.com）
 *     provider: langfuse                        # 须设为 langfuse 才触发推送
 *   langfuse:
 *     public-key: ${LANGFUSE_PUBLIC_KEY}
 *     secret-key: ${LANGFUSE_SECRET_KEY}
 * </pre>
 */
@Service
@Slf4j
public class LangfuseTraceOrchestrator {

    @Autowired
    private IntelligenceObservabilityOrchestrator observabilityOrchestrator;

    @Value("${ai.langfuse.public-key:}")
    private String publicKey;

    @Value("${ai.langfuse.secret-key:}")
    private String secretKey;

    @Value("${ai.observability.endpoint:}")
    private String endpoint;

    @Value("${ai.observability.provider:none}")
    private String observabilityProvider;

    private final RestTemplate restTemplate = new RestTemplate();

    // ──────────────────────────────────────────────────────────────
    //  Trace 推送
    // ──────────────────────────────────────────────────────────────

    /**
     * 异步推送推理结果 trace 到 Langfuse。
     * 调用方无需等待，失败不影响业务主链路。
     *
     * @param scene    业务场景（如 "supply_chain_qa", "order_risk_eval"）
     * @param tenantId 租户 ID（写入 metadata）
     * @param userId   操作用户 ID
     * @param result   AI 推理结果
     */
    @Async
    public void pushTrace(String scene, Long tenantId, String userId,
                          IntelligenceInferenceResult result) {
        if (!isConfigured()) {
            return;
        }
        try {
            String url = normalizeEndpoint() + "/api/public/ingestion";
            Map<String, Object> body = buildIngestionBody(scene, tenantId, userId, result);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, buildHeaders());
            ResponseEntity<String> resp = restTemplate.postForEntity(url, entity, String.class);
            if (resp.getStatusCode().is2xxSuccessful()) {
                log.debug("[Langfuse] trace 推送成功 traceId={} scene={}", result.getTraceId(), scene);
            } else {
                log.warn("[Langfuse] trace 推送失败 status={} traceId={}",
                        resp.getStatusCode().value(), result.getTraceId());
            }
        } catch (Exception e) {
            log.warn("[Langfuse] trace 推送异常（不影响业务）traceId={}: {}",
                    result.getTraceId(), e.getMessage());
        }
    }

    /**
     * 向 Langfuse 提交评分（采纳/拒绝等）。用于后续 RLHF 数据采集。
     *
     * @param traceId   对应 trace ID
     * @param scoreName 评分维度（如 "adopted", "user_rating"）
     * @param value     评分值（0.0~1.0 或整数）
     */
    @Async
    public void submitScore(String traceId, String scoreName, double value) {
        if (!isConfigured() || !hasText(traceId)) return;
        try {
            String url = normalizeEndpoint() + "/api/public/scores";
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("traceId", traceId);
            body.put("name", scoreName);
            body.put("value", value);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            log.debug("[Langfuse] score 提交成功 traceId={} name={} value={}", traceId, scoreName, value);
        } catch (Exception e) {
            log.warn("[Langfuse] score 提交失败 traceId={}: {}", traceId, e.getMessage());
        }
    }

    /** Langfuse 推送是否已配置（provider=langfuse + publicKey + secretKey + endpoint 均非空） */
    public boolean isConfigured() {
        return observabilityOrchestrator.isObservationReady()
                && "langfuse".equalsIgnoreCase(getProvider())
                && hasText(publicKey) && hasText(secretKey) && hasText(endpoint);
    }

    // ──────────────────────────────────────────────────────────────
    //  私有工具
    // ──────────────────────────────────────────────────────────────

    private Map<String, Object> buildIngestionBody(String scene, Long tenantId,
                                                    String userId, IntelligenceInferenceResult result) {
        Map<String, Object> traceBody = new LinkedHashMap<>();
        traceBody.put("id", result.getTraceId());
        traceBody.put("name", scene);
        traceBody.put("userId", userId);
        traceBody.put("timestamp", Instant.now().toString());
        traceBody.put("output", result.isSuccess() ? result.getContent() : result.getErrorMessage());
        traceBody.put("level", result.isSuccess() ? "DEFAULT" : "ERROR");
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("tenantId", String.valueOf(tenantId));
        meta.put("provider", orEmpty(result.getProvider()));
        meta.put("model", orEmpty(result.getModel()));
        meta.put("fallback", result.isFallbackUsed());
        meta.put("latencyMs", result.getLatencyMs());
        meta.put("toolCallCount", result.getToolCallCount());
        traceBody.put("metadata", meta);

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("id", UUID.randomUUID().toString());
        event.put("timestamp", Instant.now().toString());
        event.put("type", "trace-create");
        event.put("body", traceBody);

        List<Map<String, Object>> batch = new ArrayList<>();
        batch.add(event);
        Map<String, Object> ingestion = new LinkedHashMap<>();
        ingestion.put("batch", batch);
        return ingestion;
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        String credentials = publicKey + ":" + secretKey;
        headers.set("Authorization", "Basic " +
                Base64.getEncoder().encodeToString(credentials.getBytes()));
        return headers;
    }

    private String normalizeEndpoint() {
        String ep = endpoint.trim();
        return ep.endsWith("/") ? ep.substring(0, ep.length() - 1) : ep;
    }

    private String getProvider() {
        return observabilityProvider != null ? observabilityProvider : "none";
    }

    private String orEmpty(String s) { return s != null ? s : ""; }
    private boolean hasText(String s) { return s != null && !s.isBlank(); }
}
