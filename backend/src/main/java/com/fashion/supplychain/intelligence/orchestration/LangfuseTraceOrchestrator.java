package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.context.annotation.Lazy;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

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
@Lazy
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
    //  P0-4: Span / Event / Generation 全链路追踪（新增方法，不修改现有 pushTrace/submitScore）
    // ──────────────────────────────────────────────────────────────

    /** spanId → traceId 映射，用于 endSpan 时查找所属 trace */
    private final ConcurrentHashMap<String, String> spanTraceMap = new ConcurrentHashMap<>();

    /**
     * 创建带指定 traceId 的 trace（用于全链路 span 关联）。
     * 与现有 4 参数 pushTrace 不同，本方法同步执行并返回 traceId，
     * 以便调用方后续创建父子 span。
     *
     * @param traceId  调用方指定的 trace ID（通常使用 commandId 保证全链路一致）
     * @param scene    业务场景
     * @param tenantId 租户 ID
     * @param userId   用户 ID
     * @return traceId（Langfuse 不可用时仍返回传入的 traceId，不影响 span 关联）
     */
    public String pushTraceWithId(String traceId, String scene, Long tenantId, String userId) {
        if (!isConfigured() || !hasText(traceId)) return traceId;
        try {
            String url = normalizeEndpoint() + "/api/public/ingestion";
            Map<String, Object> body = buildTraceCreateBody(traceId, scene, tenantId, userId);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            log.debug("[Langfuse] trace 创建成功 traceId={} scene={}", traceId, scene);
        } catch (Exception e) {
            log.warn("[Langfuse] trace 创建异常（不影响业务）traceId={}: {}", traceId, e.getMessage());
        }
        return traceId;
    }

    /**
     * 创建 span（调 Langfuse Ingestion API span-create），返回 spanId。
     *
     * @param traceId  所属 trace ID
     * @param spanName span 名称
     * @param parentId 父 observation ID（可为 null）
     * @param metadata 额外元数据（可为 null）
     * @return spanId（Langfuse 不可用时返回 null）
     */
    public String beginSpan(String traceId, String spanName, String parentId, Map<String, Object> metadata) {
        if (!isConfigured() || !hasText(traceId)) return null;
        String spanId = UUID.randomUUID().toString();
        try {
            Map<String, Object> spanBody = new LinkedHashMap<>();
            spanBody.put("id", spanId);
            spanBody.put("traceId", traceId);
            if (parentId != null) spanBody.put("parentObservationId", parentId);
            spanBody.put("name", spanName);
            spanBody.put("startTime", Instant.now().toString());
            if (metadata != null) spanBody.put("metadata", metadata);

            Map<String, Object> ingestion = buildIngestionWrapper("span-create", spanBody);
            String url = normalizeEndpoint() + "/api/public/ingestion";
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(ingestion, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            spanTraceMap.put(spanId, traceId);
            log.debug("[Langfuse] span 创建成功 traceId={} spanId={} name={}", traceId, spanId, spanName);
        } catch (Exception e) {
            log.warn("[Langfuse] span 创建异常（不影响业务）spanName={}: {}", spanName, e.getMessage());
        }
        return spanId;
    }

    /**
     * 结束 span（调 Langfuse Ingestion API span-update），设置 endTime 和状态。
     *
     * @param spanId        要结束的 span ID
     * @param durationMs    持续时间（毫秒）
     * @param level         级别（DEFAULT / DEBUG / WARNING / ERROR）
     * @param statusMessage 状态消息（可为 null）
     */
    public void endSpan(String spanId, Long durationMs, String level, String statusMessage) {
        if (!isConfigured() || !hasText(spanId)) return;
        try {
            String traceId = spanTraceMap.remove(spanId);
            Map<String, Object> spanBody = new LinkedHashMap<>();
            spanBody.put("id", spanId);
            if (traceId != null) spanBody.put("traceId", traceId);
            spanBody.put("endTime", Instant.now().toString());
            if (level != null) spanBody.put("level", level);
            if (statusMessage != null) spanBody.put("statusMessage", statusMessage);

            Map<String, Object> ingestion = buildIngestionWrapper("span-update", spanBody);
            String url = normalizeEndpoint() + "/api/public/ingestion";
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(ingestion, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            log.debug("[Langfuse] span 结束 spanId={} durationMs={} level={}", spanId, durationMs, level);
        } catch (Exception e) {
            log.warn("[Langfuse] span 结束异常（不影响业务）spanId={}: {}", spanId, e.getMessage());
        }
    }

    /**
     * 记录 event 到 trace/span（调 Langfuse Ingestion API event-create）。
     *
     * @param traceId   所属 trace ID
     * @param spanId    关联 span ID（可为 null，挂在 trace 根上）
     * @param eventName 事件名称
     * @param payload   事件负载（可为 null）
     */
    public void recordEvent(String traceId, String spanId, String eventName, Map<String, Object> payload) {
        if (!isConfigured() || !hasText(traceId)) return;
        try {
            Map<String, Object> eventBody = new LinkedHashMap<>();
            eventBody.put("id", UUID.randomUUID().toString());
            eventBody.put("traceId", traceId);
            if (spanId != null) eventBody.put("parentObservationId", spanId);
            eventBody.put("name", eventName);
            eventBody.put("startTime", Instant.now().toString());
            if (payload != null) eventBody.put("metadata", payload);

            Map<String, Object> ingestion = buildIngestionWrapper("event-create", eventBody);
            String url = normalizeEndpoint() + "/api/public/ingestion";
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(ingestion, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            log.debug("[Langfuse] event 记录 traceId={} spanId={} name={}", traceId, spanId, eventName);
        } catch (Exception e) {
            log.warn("[Langfuse] event 记录异常（不影响业务）eventName={}: {}", eventName, e.getMessage());
        }
    }

    /**
     * 记录 generation（LLM 调用）到 trace/span（调 Langfuse Ingestion API generation-create）。
     *
     * @param traceId    所属 trace ID
     * @param spanId     关联 span ID（可为 null）
     * @param model      模型名称
     * @param prompt     输入 prompt
     * @param completion 输出 completion
     * @param durationMs 持续时间（毫秒）
     */
    public void recordGeneration(String traceId, String spanId, String model,
                                  String prompt, String completion, Long durationMs) {
        if (!isConfigured() || !hasText(traceId)) return;
        try {
            Map<String, Object> genBody = new LinkedHashMap<>();
            genBody.put("id", UUID.randomUUID().toString());
            genBody.put("traceId", traceId);
            if (spanId != null) genBody.put("parentObservationId", spanId);
            genBody.put("name", "generation");
            genBody.put("model", model != null ? model : "unknown");
            genBody.put("startTime", Instant.now().toString());
            if (prompt != null) genBody.put("prompt", prompt);
            if (completion != null) genBody.put("completion", completion);

            Map<String, Object> ingestion = buildIngestionWrapper("generation-create", genBody);
            String url = normalizeEndpoint() + "/api/public/ingestion";
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(ingestion, buildHeaders());
            restTemplate.postForEntity(url, entity, String.class);
            log.debug("[Langfuse] generation 记录 traceId={} model={} durationMs={}", traceId, model, durationMs);
        } catch (Exception e) {
            log.warn("[Langfuse] generation 记录异常（不影响业务）model={}: {}", model, e.getMessage());
        }
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

    /** P0-4: 构建 trace-create 请求体（用于 pushTraceWithId） */
    private Map<String, Object> buildTraceCreateBody(String traceId, String scene,
                                                       Long tenantId, String userId) {
        Map<String, Object> traceBody = new LinkedHashMap<>();
        traceBody.put("id", traceId);
        traceBody.put("name", scene);
        if (userId != null) traceBody.put("userId", userId);
        traceBody.put("timestamp", Instant.now().toString());
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("tenantId", tenantId != null ? String.valueOf(tenantId) : "");
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

    /** P0-4: 构建 ingestion 包装体（用于 span/event/generation） */
    private Map<String, Object> buildIngestionWrapper(String type, Map<String, Object> body) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("id", UUID.randomUUID().toString());
        event.put("timestamp", Instant.now().toString());
        event.put("type", type);
        event.put("body", body);
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
