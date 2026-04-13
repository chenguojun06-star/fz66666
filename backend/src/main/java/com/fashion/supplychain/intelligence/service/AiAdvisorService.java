package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AI 顾问服务。
 *
 * <p>职责：保留配额与启用判断，对外提供 AI 顾问语义能力。
 * 真实推理由独立的 {@link IntelligenceInferenceOrchestrator} 执行。</p>
 *
 * <p>默认直连 DeepSeek，也支持通过 LiteLLM 网关接入，配置方式（环境变量）：
 * <pre>
 *   DEEPSEEK_API_KEY     = sk-xxxxxxxxxxxxxxxx
 *   AI_LITELLM_ENABLED   = true/false
 *   AI_LITELLM_BASE_URL  = http://localhost:4000
 *   AI_LITELLM_API_KEY   = sk-virtual-key
 * </pre>
 *
 * <p>若未配置 AI_API_KEY，所有调用会立即返回 null，系统继续走本地规则引擎，
 * 不影响任何现有功能。
 */
@Service
@Slf4j
public class AiAdvisorService {

    @Value("${ai.deepseek.api-key:}")
    private String apiKey;

    /** 每个租户每天最多允许调用 DeepSeek 的次数（0 = 不限制） */
    @Value("${ai.deepseek.daily-quota-per-tenant:50}")
    private int dailyQuotaPerTenant;

    @Autowired
    private IntelligenceInferenceOrchestrator intelligenceInferenceOrchestrator;

    /**
     * 每租户每日调用计数器
     * key = "tenantId_yyyyMMdd"，value = 当日已调用次数
     * 不同日期的 key 自动过期（不再被读写），内存占用可忽略不计
     */
    private final ConcurrentHashMap<String, AtomicInteger> dailyCounters = new ConcurrentHashMap<>();

    @Scheduled(fixedRate = 3600000)
    public void cleanupStaleCounters() {
        String todaySuffix = "_" + LocalDate.now();
        dailyCounters.keySet().removeIf(key -> !key.endsWith(todaySuffix));
    }

    /**
     * 是否已启用 AI（有 API Key）
     */
    public boolean isEnabled() {
        return intelligenceInferenceOrchestrator.isAnyModelEnabled();
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
        IntelligenceInferenceResult result = invoke("ai-advisor", systemPrompt, userMessage);
        if (!result.isSuccess()) {
            log.warn("[AiAdvisor] AI 调用失败 provider={} error={}", result.getProvider(), result.getErrorMessage());
            return null;
        }
        return result.getContent();
    }

    /**
     * 智能建议：给定业务数据摘要，返回简短建议文案（用于运营日报）
     *
     * <p>结果按 contextSummary 内容缓存 5 分钟，相同摘要（同一租户当日数据未变化）
     * 直接返回缓存值，避免重复调用 DeepSeek API（每次约 2~3 秒延迟）。
     * Redis 不可用时自动降级为直接调用 AI（见 RedisConfig.errorHandler）。</p>
     *
     * @param contextSummary 业务摘要（如：今日逾期3单，高风险2单，停滞1单）
     * @return 1~3句建议文案，未启用时返回 null
     */
    @Cacheable(value = "daily-brief", key = "T(com.fashion.supplychain.common.UserContext).tenantId() + ':' + T(java.time.LocalDate).now()")
    public String getDailyAdvice(String contextSummary) {
        String systemPrompt = "你是一名服装供应链管理顾问，根据工厂今日生产数据，" +
                "用简洁中文给出1~3条可执行的管理建议。每条建议一行，不超过30字。不要废话。";
        IntelligenceInferenceResult result = invoke("daily-brief", systemPrompt, contextSummary);
        return result.isSuccess() ? result.getContent() : null;
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
        IntelligenceInferenceResult result = invoke("nl-intent", systemPrompt, question);
        return result.isSuccess() ? result.getContent() : null;
    }

    private IntelligenceInferenceResult invoke(String scene, String systemPrompt, String userMessage) {
        if (!isEnabled()) {
            IntelligenceInferenceResult result = new IntelligenceInferenceResult();
            result.setSuccess(false);
            result.setProvider("none");
            result.setErrorMessage("ai-disabled");
            return result;
        }
        return intelligenceInferenceOrchestrator.chat(scene, systemPrompt, userMessage);
    }
}
