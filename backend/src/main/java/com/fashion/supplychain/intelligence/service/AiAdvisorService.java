package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AI 顾问服务 — 统一的 AI API 接入层
 *
 * <p>默认接 DeepSeek，配置方式（环境变量）：
 * <pre>
 *   AI_API_KEY     = sk-xxxxxxxxxxxxxxxx   （必填，有此值才会真实调用 AI）
 *   AI_API_URL     = https://api.deepseek.com/v1/chat/completions  （可选，默认 DeepSeek）
 *   AI_MODEL       = deepseek-chat  （可选，默认 deepseek-chat）
 * </pre>
 *
 * <p>若未配置 AI_API_KEY，所有调用会立即返回 null，系统继续走本地规则引擎，
 * 不影响任何现有功能。
 *
 * <p>切换 OpenAI / 其他兼容 API 只需改 AI_API_URL 和 AI_MODEL。
 */
@Service
@Slf4j
public class AiAdvisorService {

    @Value("${ai.deepseek.api-key:}")
    private String apiKey;

    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String apiUrl;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String model;

    /** 每个租户每天最多允许调用 DeepSeek 的次数（0 = 不限制） */
    @Value("${ai.deepseek.daily-quota-per-tenant:50}")
    private int dailyQuotaPerTenant;

    private static final int TIMEOUT_SECONDS = 30;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 每租户每日调用计数器
     * key = "tenantId_yyyyMMdd"，value = 当日已调用次数
     * 不同日期的 key 自动过期（不再被读写），内存占用可忽略不计
     */
    private final ConcurrentHashMap<String, AtomicInteger> dailyCounters = new ConcurrentHashMap<>();

    /**
     * 是否已启用 AI（有 API Key）
     */
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 检查当前租户今日配额是否已用完
     *
     * @param tenantId 租户ID（null 视为系统内部调用，不限制）
     * @return true = 配额充足可以调用；false = 今日配额已用完
     */
    public boolean checkAndConsumeQuota(Long tenantId) {
        if (dailyQuotaPerTenant <= 0 || tenantId == null) return true;   // 0=不限
        String key = tenantId + "_" + LocalDate.now();
        AtomicInteger count = dailyCounters.computeIfAbsent(key, k -> new AtomicInteger(0));
        int used = count.incrementAndGet();
        if (used > dailyQuotaPerTenant) {
            count.decrementAndGet();   // 回滚，不消耗
            log.warn("[AiAdvisor] 租户 {} 今日AI调用已达配额上限 {}", tenantId, dailyQuotaPerTenant);
            return false;
        }
        log.debug("[AiAdvisor] 租户 {} 今日AI调用 {}/{}", tenantId, used, dailyQuotaPerTenant);
        return true;
    }

    /**
     * 查询当前租户今日已用配额
     */
    public int getTodayUsage(Long tenantId) {
        if (tenantId == null) return 0;
        String key = tenantId + "_" + LocalDate.now();
        AtomicInteger count = dailyCounters.get(key);
        return count == null ? 0 : count.get();
    }

    /**
     * 发送单轮对话请求
     *
     * @param systemPrompt 系统角色描述（如：你是服装供应链分析师）
     * @param userMessage  用户消息
     * @return AI 回复文本，未配置 Key 或调用失败时返回 null
     */
    public String chat(String systemPrompt, String userMessage) {
        if (!isEnabled()) {
            log.debug("[AiAdvisor] AI_API_KEY 未配置，跳过 AI 调用");
            return null;
        }

        try {
            String body = buildRequestBody(systemPrompt, userMessage);
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                return extractContent(response.body());
            } else {
                log.warn("[AiAdvisor] API 返回非200: status={}, body={}", response.statusCode(),
                        response.body().substring(0, Math.min(200, response.body().length())));
                return null;
            }
        } catch (Exception e) {
            log.warn("[AiAdvisor] AI 调用失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 智能建议：给定业务数据摘要，返回简短建议文案（用于运营日报）
     *
     * @param contextSummary 业务摘要（如：今日逾期3单，高风险2单，停滞1单）
     * @return 1~3句建议文案，未启用时返回 null
     */
    public String getDailyAdvice(String contextSummary) {
        String systemPrompt = "你是一名服装供应链管理顾问，根据工厂今日生产数据，" +
                "用简洁中文给出1~3条可执行的管理建议。每条建议一行，不超过30字。不要废话。";
        return chat(systemPrompt, contextSummary);
    }

    /**
     * 自然语言转结构化查询意图分析
     * 当 NlQueryOrchestrator 本地规则无法匹配时，调用此方法让 AI 理解意图
     *
     * @param question 用户问题
     * @return JSON 字符串，格式：{"intent":"xxx","params":{"key":"value"}}
     *         失败返回 null
     */
    public String parseNlIntent(String question) {
        String systemPrompt = "你是服装供应链系统的 NLP 解析器。" +
                "将用户问题解析为 JSON：{\"intent\":\"意图\",\"params\":{\"参数\":\"值\"}}。" +
                "可能的 intent: query_order_status, query_material_stock, query_factory_capacity, " +
                "query_finance_settlement, query_worker_efficiency, query_delivery_risk。" +
                "只输出 JSON，不要解释。";
        return chat(systemPrompt, question);
    }

    // ────────────────── 私有方法 ──────────────────

    private String buildRequestBody(String systemPrompt, String userMessage) throws Exception {
        var root = MAPPER.createObjectNode();
        root.put("model", model);
        root.put("temperature", 0.3);
        root.put("max_tokens", 512);
        var messages = root.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userMessage);
        return MAPPER.writeValueAsString(root);
    }

    private String extractContent(String responseBody) throws Exception {
        JsonNode root = MAPPER.readTree(responseBody);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            return choices.get(0).path("message").path("content").asText(null);
        }
        return null;
    }
}
