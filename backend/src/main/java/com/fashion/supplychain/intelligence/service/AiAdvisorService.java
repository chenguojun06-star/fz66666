package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

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

    /**
     * 系统桶租户ID：用于归集「无租户上下文」的调用。
     * 与 {@code AiAgentTokenBudgetService.SYSTEM_TENANT_ID} 保持一致（均为 0）。
     */
    private static final long SYSTEM_TENANT_ID = 0L;

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
     * 检查当前租户今日配额是否已用完（<b>不计数</b>）。
     *
     * <p>D-702：语义已由「检查并消费」改为「纯查询」。原因是配额计数必须与真实调用
     * 1:1，否则会出现双重计数 —— 调用方先调本方法 +1，真正发请求时
     * {@link #invoke} 再 +1，同一次逻辑被记两次，限额被凭空吃掉一半。
     *
     * <p>保留本方法的用途：让调用方在批量工作<b>开始前</b>先判断「值不值得做」，
     * 避免明知超限还白跑一堆查库/组装。最终是否放行一律由 invoke 裁决。
     *
     * @param tenantId 租户ID（null 视为系统桶）
     * @return true = 配额尚充足；false = 已达上限
     */
    public boolean checkAndConsumeQuota(Long tenantId) {
        if (dailyQuotaPerTenant <= 0) return true;   // 0=不限
        long effective = tenantId != null ? tenantId : SYSTEM_TENANT_ID;
        return isQuotaAvailable(effective);
    }

    /** 纯查询：不改变计数。供调用方在批量工作开始前判断"值不值得做"。 */
    private boolean isQuotaAvailable(long effectiveTenantId) {
        if (dailyQuotaPerTenant <= 0) return true;
        String key = effectiveTenantId + "_" + LocalDate.now();
        AtomicInteger count = dailyCounters.computeIfAbsent(key, k -> new AtomicInteger(0));
        return count.get() < dailyQuotaPerTenant;
    }

    /**
     * 计数 + 判断是否放行。这是<b>唯一</b>改变计数的地方。
     * 超限时回滚计数，保证"被拒绝的请求不消耗额度"。
     */
    private boolean tryConsumeQuotaInternal(long effectiveTenantId) {
        if (dailyQuotaPerTenant <= 0) return true;
        String key = effectiveTenantId + "_" + LocalDate.now();
        AtomicInteger count = dailyCounters.computeIfAbsent(key, k -> new AtomicInteger(0));
        int used = count.incrementAndGet();
        if (used > dailyQuotaPerTenant) {
            count.decrementAndGet();   // 回滚，被拒的请求不消耗额度
            return false;
        }
        log.debug("[AiAdvisor] 租户 {} 今日AI调用 {}/{}", effectiveTenantId, used, dailyQuotaPerTenant);
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

    /**
     * D-702 P0：所有 AI 调用的唯一出口，配额在此收口。
     *
     * <p><b>修复前</b>：配额检查只在 {@link #checkAndConsumeQuota(Long)} 里，由调用方手动调用。
     * 而 {@link #chat(String, String)} 等出口<b>完全不检查</b>。后果是
     * 「检查」与「调用」彻底脱节——生产实测日配额 50，实际调用 209 次（超 4 倍），
     * 配额形同虚设。最典型的是 {@code IntelligenceSignalOrchestrator}：
     * 每半小时先 {@code checkAndConsumeQuota()} 一次（计数 +1），
     * 随后 {@code enrichWithAiAnalysis} 内部用 {@code .limit(5)} 连发 5 次 chat，
     * <b>5 次全部绕过配额</b>。重复调用方遍布 19 个 orchestrator/service。
     *
     * <p><b>为什么在 invoke 收口</b>：只有这里能保证「一次调用 = 一次计数」，
     * 无论调用方是否记得先检查。宁可偶发多拒一次，也不能让限额失去意义——
     * D-700 的教训正是「账单累计却说不清钱花在哪」。
     */
    private IntelligenceInferenceResult invoke(String scene, String systemPrompt, String userMessage) {
        // UserContext.tenantId() 无上下文时返回 null（不抛异常），故可直接判断。
        // 无租户上下文归系统桶（tenant 0），与 AiAgentTokenBudgetService 口径一致：
        // 不直接放行不计量，而是让它们至少可被总量限制（CLAUDE.md AI 成本章节约定）。
        Long ctxTenantId = UserContext.tenantId();
        long quotaTenantId = ctxTenantId != null ? ctxTenantId : SYSTEM_TENANT_ID;
        if (!tryConsumeQuotaInternal(quotaTenantId)) {
            IntelligenceInferenceResult result = new IntelligenceInferenceResult();
            result.setSuccess(false);
            result.setProvider("quota-exceeded");
            result.setErrorMessage("daily-quota-exceeded: tenant=" + quotaTenantId
                    + " limit=" + dailyQuotaPerTenant);
            log.warn("[AiAdvisor] 租户 {} 今日AI调用已达配额上限 {}，scene={} 请求被拦截", quotaTenantId, dailyQuotaPerTenant, scene);
            return result;
        }
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
