package com.fashion.supplychain.intelligence.health;

import com.fashion.supplychain.intelligence.gateway.ModelConsortiumRouter;
import com.fashion.supplychain.intelligence.orchestration.LiteLLMAdminOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LangfuseTraceOrchestrator;
import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 组件统一健康检查指示器。
 *
 * <p>【P1-2修复】原 prod 环境 actuator 仅暴露 health/info，AI 组件故障只能靠日志发现。
 * 现通过 Spring Boot HealthIndicator 机制，将 5 个 AI 组件的健康状态聚合到 /actuator/health：
 *
 * <ul>
 *   <li>DeepSeek：HTTP GET {base-url}/v1/models（Authorization: Bearer {key}），2xx 视为 UP</li>
 *   <li>Qdrant：复用 {@link QdrantService#isAvailable()}（GET /healthz）</li>
 *   <li>Agnes：HTTP GET {base-url}/v1/models（与 DeepSeek 类似的 OpenAI 兼容接口）</li>
 *   <li>LiteLLM：复用 {@link LiteLLMAdminOrchestrator#ping()}（GET /health）</li>
 *   <li>Langfuse：配置完整性检查（endpoint + publicKey + secretKey 非空且 endpoint 可达）</li>
 * </ul>
 *
 * <p>设计原则：
 * <ol>
 *   <li>每次健康检查总耗时 ≤ 10s（单组件超时 2s），避免拖慢 /actuator/health</li>
 *   <li>任一组件 DOWN 不影响其他组件检查（独立 try-catch）</li>
 *   <li>组件未配置时返回 UNKNOWN（不视为 DOWN，避免误告警）</li>
 *   <li>所有组件均 UP 时整体 UP；任一 DOWN 时整体 DOWN（运维可及时发现）</li>
 *   <li>支持通过 yml 关闭：management.health.ai.enabled=false</li>
 * </ol>
 *
 * <p>查看方式：
 * <pre>
 *   curl -H "Authorization: Bearer {jwt}" https://api.webyszl.cn/actuator/health
 *   → response.components.ai.components.deepSeek.status = "UP"
 * </pre>
 */
@Slf4j
@Component
@Lazy
public class AiComponentHealthIndicator implements HealthIndicator {

    /** 单组件 HTTP 探活超时（秒） */
    private static final int PROBE_TIMEOUT_SECONDS = 2;

    /** 探活专用 HttpClient（连接超时 2s，避免拖慢 actuator） */
    private static final HttpClient PROBE_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(PROBE_TIMEOUT_SECONDS))
            .build();

    @Value("${management.health.ai.enabled:true}")
    private boolean aiHealthEnabled;

    // ── DeepSeek ──
    @Value("${ai.deepseek.api-key:}")
    private String deepseekApiKey;

    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String deepseekApiUrl;

    // ── Agnes ──
    @Value("${ai.agnes.api-key:}")
    private String agnesApiKey;

    @Value("${ai.agnes.api-url:https://apihub.agnes-ai.com/v1/chat/completions}")
    private String agnesApiUrl;

    // ── Langfuse ──
    @Value("${ai.observability.endpoint:}")
    private String langfuseEndpoint;

    @Value("${ai.langfuse.public-key:}")
    private String langfusePublicKey;

    @Value("${ai.langfuse.secret-key:}")
    private String langfuseSecretKey;

    @Value("${ai.observability.provider:none}")
    private String observabilityProvider;

    @Autowired(required = false)
    private QdrantService qdrantService;

    @Autowired(required = false)
    private LiteLLMAdminOrchestrator liteLLMAdminOrchestrator;

    @Autowired(required = false)
    @Lazy
    private LangfuseTraceOrchestrator langfuseTraceOrchestrator;

    @Autowired(required = false)
    @Lazy
    private ModelConsortiumRouter modelConsortiumRouter;

    @Override
    public Health health() {
        if (!aiHealthEnabled) {
            return Health.unknown().withDetail("reason", "management.health.ai.enabled=false").build();
        }

        Map<String, Object> components = new LinkedHashMap<>();
        boolean allUp = true;

        // 1. DeepSeek
        HealthResult deepseek = checkDeepSeek();
        components.put("deepSeek", deepseek.toMap());
        if (!deepseek.up) allUp = false;

        // 2. Qdrant
        HealthResult qdrant = checkQdrant();
        components.put("qdrant", qdrant.toMap());
        if (!qdrant.up) allUp = false;

        // 3. Agnes
        HealthResult agnes = checkAgnes();
        components.put("agnes", agnes.toMap());
        if (!agnes.up) allUp = false;

        // 4. LiteLLM
        HealthResult litellm = checkLiteLLM();
        components.put("litellm", litellm.toMap());
        if (!litellm.up) allUp = false;

        // 5. Langfuse
        HealthResult langfuse = checkLangfuse();
        components.put("langfuse", langfuse.toMap());
        if (!langfuse.up) allUp = false;

        Health.Builder builder = allUp ? Health.up() : Health.down();
        return builder.withDetails(components).build();
    }

    // ──────────────────────────────────────────────────────────────
    //  各组件健康检查
    // ──────────────────────────────────────────────────────────────

    /** DeepSeek：GET {base}/v1/models 检查 API Key 有效性 */
    private HealthResult checkDeepSeek() {
        if (isBlank(deepseekApiKey)) {
            return HealthResult.unknown("api-key 未配置");
        }
        String baseUrl = extractBaseUrl(deepseekApiUrl);
        String probeUrl = baseUrl + "/v1/models";
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(probeUrl))
                    .header("Authorization", "Bearer " + deepseekApiKey)
                    .timeout(Duration.ofSeconds(PROBE_TIMEOUT_SECONDS))
                    .GET()
                    .build();
            HttpResponse<Void> resp = PROBE_CLIENT.send(req, HttpResponse.BodyHandlers.discarding());
            boolean up = resp.statusCode() >= 200 && resp.statusCode() < 300;
            return new HealthResult(up, up ? "OK" : "HTTP " + resp.statusCode(),
                    Map.of("probeUrl", probeUrl, "statusCode", resp.statusCode()));
        } catch (Exception e) {
            return HealthResult.down("探活失败: " + e.getMessage(),
                    Map.of("probeUrl", probeUrl, "error", e.getClass().getSimpleName()));
        }
    }

    /** Qdrant：复用 QdrantService.isAvailable() */
    private HealthResult checkQdrant() {
        if (qdrantService == null) {
            return HealthResult.unknown("QdrantService 未注入");
        }
        try {
            boolean up = qdrantService.isAvailable();
            Map<String, Object> dimInfo = safeCall(qdrantService::getVectorDimInfo);
            return new HealthResult(up, up ? "OK" : "Qdrant 不可达", dimInfo);
        } catch (Exception e) {
            return HealthResult.down("检查异常: " + e.getMessage(),
                    Map.of("error", e.getClass().getSimpleName()));
        }
    }

    /** Agnes：GET {base}/v1/models 检查视觉模型 API Key 有效性 */
    private HealthResult checkAgnes() {
        if (isBlank(agnesApiKey)) {
            return HealthResult.unknown("api-key 未配置");
        }
        String baseUrl = extractBaseUrl(agnesApiUrl);
        String probeUrl = baseUrl + "/v1/models";
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(probeUrl))
                    .header("Authorization", "Bearer " + agnesApiKey)
                    .timeout(Duration.ofSeconds(PROBE_TIMEOUT_SECONDS))
                    .GET()
                    .build();
            HttpResponse<Void> resp = PROBE_CLIENT.send(req, HttpResponse.BodyHandlers.discarding());
            boolean up = resp.statusCode() >= 200 && resp.statusCode() < 300;
            return new HealthResult(up, up ? "OK" : "HTTP " + resp.statusCode(),
                    Map.of("probeUrl", probeUrl, "statusCode", resp.statusCode()));
        } catch (Exception e) {
            return HealthResult.down("探活失败: " + e.getMessage(),
                    Map.of("probeUrl", probeUrl, "error", e.getClass().getSimpleName()));
        }
    }

    /** LiteLLM：复用 LiteLLMAdminOrchestrator.ping() */
    private HealthResult checkLiteLLM() {
        if (liteLLMAdminOrchestrator == null) {
            return HealthResult.unknown("LiteLLMAdminOrchestrator 未注入");
        }
        try {
            boolean up = liteLLMAdminOrchestrator.ping();
            return new HealthResult(up, up ? "OK" : "LiteLLM 不可达", Map.of());
        } catch (Exception e) {
            return HealthResult.down("检查异常: " + e.getMessage(),
                    Map.of("error", e.getClass().getSimpleName()));
        }
    }

    /** Langfuse：配置完整性 + endpoint 可达性（仅 provider=langfuse 时检查） */
    private HealthResult checkLangfuse() {
        if (!"langfuse".equalsIgnoreCase(observabilityProvider)) {
            return HealthResult.unknown("provider != langfuse（当前: " + observabilityProvider + "）");
        }
        if (isBlank(langfuseEndpoint) || isBlank(langfusePublicKey) || isBlank(langfuseSecretKey)) {
            return HealthResult.down("配置不完整（endpoint/publicKey/secretKey 需全配置）",
                    Map.of("endpoint", maskUrl(langfuseEndpoint),
                            "publicKey", maskKey(langfusePublicKey),
                            "secretKey", maskKey(langfuseSecretKey)));
        }
        // endpoint 可达性探活（GET /api/public/health，2xx 视为 UP）
        String probeUrl = normalizeEndpoint(langfuseEndpoint) + "/api/public/health";
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(probeUrl))
                    .timeout(Duration.ofSeconds(PROBE_TIMEOUT_SECONDS))
                    .GET()
                    .build();
            HttpResponse<Void> resp = PROBE_CLIENT.send(req, HttpResponse.BodyHandlers.discarding());
            boolean up = resp.statusCode() >= 200 && resp.statusCode() < 300;
            return new HealthResult(up, up ? "OK" : "HTTP " + resp.statusCode(),
                    Map.of("probeUrl", probeUrl, "statusCode", resp.statusCode()));
        } catch (Exception e) {
            return HealthResult.down("探活失败: " + e.getMessage(),
                    Map.of("probeUrl", probeUrl, "error", e.getClass().getSimpleName()));
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  工具方法
    // ──────────────────────────────────────────────────────────────

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** 从 chat/completions URL 提取 base URL：https://api.deepseek.com/v1/chat/completions → https://api.deepseek.com */
    private static String extractBaseUrl(String apiUrl) {
        if (apiUrl == null) return "";
        int idx = apiUrl.indexOf("/v1/");
        return idx > 0 ? apiUrl.substring(0, idx) : apiUrl.replaceAll("/+$", "");
    }

    private static String normalizeEndpoint(String endpoint) {
        if (endpoint == null) return "";
        return endpoint.replaceAll("/+$", "");
    }

    /** 脱敏 URL：仅保留 scheme + host，隐藏 path */
    private static String maskUrl(String url) {
        if (url == null || url.isBlank()) return "";
        try {
            URI uri = URI.create(url);
            return uri.getScheme() + "://" + uri.getHost() + "/***";
        } catch (Exception e) {
            return "***";
        }
    }

    /** 脱敏 key：仅显示前 4 位 + 后 2 位 */
    private static String maskKey(String key) {
        if (key == null || key.isBlank()) return "";
        if (key.length() <= 6) return "***";
        return key.substring(0, 4) + "***" + key.substring(key.length() - 2);
    }

    private static <T> T safeCall(java.util.function.Supplier<T> supplier) {
        try {
            return supplier.get();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 健康检查结果封装。
     * up=true → UP；up=false 且 unknown=true → UNKNOWN；up=false 且 unknown=false → DOWN
     */
    private static class HealthResult {
        final boolean up;
        final boolean unknown;
        final String message;
        final Map<String, Object> details;

        HealthResult(boolean up, String message, Map<String, Object> details) {
            this(up, false, message, details);
        }

        private HealthResult(boolean up, boolean unknown, String message, Map<String, Object> details) {
            this.up = up;
            this.unknown = unknown;
            this.message = message;
            this.details = details == null ? Map.of() : details;
        }

        static HealthResult unknown(String message) {
            return new HealthResult(false, true, message, Map.of());
        }

        static HealthResult down(String message, Map<String, Object> details) {
            return new HealthResult(false, false, message, details);
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("status", up ? "UP" : (unknown ? "UNKNOWN" : "DOWN"));
            m.put("message", message);
            if (!details.isEmpty()) m.put("details", details);
            return m;
        }
    }
}
