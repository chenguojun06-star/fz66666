package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.AiAgentMetricsService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.ProactiveInsightService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.service.SkillCrystallizationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 顾问支撑能力编排层（状态 / 指标 / 诊断 / 洞察 / 工具可见性 / 技能反馈）
 *
 * <p>原 {@code IntelligenceAiAdvisorController} 直接注入了 6 个 Service
 * （{@code AiAdvisorService}、{@code AiAgentMetricsService}、{@code QdrantService}、
 * {@code ProactiveInsightService}、{@code AiAgentToolAccessService}、
 * {@code SkillCrystallizationService}），违反 ArchUnit 规则6。
 *
 * <p>这 6 个 Service 分属「开关状态 / 指标快照 / 向量库诊断 / 主动洞察 / 工具可见性 /
 * 技能结晶」六个子域，**没有任何既有编排器同时持有其中两个**（实测逐个 grep 确认），
 * 故新建本类统一承接，避免把改动散落到 4~5 个既有编排器。
 *
 * <p>本层方法只返回领域结果，**不返回 {@code Result}** —— 响应码与降级文案由 Controller 决定。
 */
@Slf4j
@Service
public class AiAdvisorSupportOrchestrator {

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private AiAgentMetricsService aiAgentMetricsService;

    @Autowired
    private QdrantService qdrantService;

    @Autowired
    private ProactiveInsightService proactiveInsightService;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    /** 可选 —— 与重构前一致，未装配时 {@link #recordSkillFeedbackQuietly} 静默跳过。 */
    @Autowired(required = false)
    private SkillCrystallizationService skillCrystallizationService;

    /** AI 顾问是否已启用（模型直连或模型网关配置就绪）。 */
    public boolean isAdvisorEnabled() {
        return aiAdvisorService.isEnabled();
    }

    /** Agent 运行指标快照。 */
    public AiAgentMetricsService.MetricsSnapshot getAgentMetricsSnapshot() {
        return aiAgentMetricsService.getSnapshot();
    }

    /**
     * Qdrant 向量库诊断片段：就绪状态 + 向量维度信息。
     *
     * <p>探测失败不抛异常，写入 {@code "ERROR: ..."} 字符串（与重构前一致，
     * 便于诊断端点原样展示失败原因）。
     */
    public Map<String, Object> qdrantDiagnostics() {
        Map<String, Object> diag = new LinkedHashMap<>();
        diag.put("qdrantServiceReady", qdrantService != null);
        if (qdrantService != null) {
            try {
                diag.put("vectorDim", qdrantService.getVectorDimInfo());
            } catch (Exception e) {
                diag.put("vectorDim", "ERROR: " + e.getMessage());
            }
        }
        return diag;
    }

    /** 当前租户的未读主动洞察。 */
    public List<ProactiveInsightService.InsightItem> getUnreadInsights(Long tenantId) {
        return proactiveInsightService.getUnreadInsights(tenantId);
    }

    /** 标记主动洞察已读。 */
    public void markInsightRead(Long tenantId, String insightId) {
        proactiveInsightService.markAsRead(tenantId, insightId);
    }

    /** 解析当前账号可见的 Agent 工具。 */
    public List<AgentTool> resolveVisibleTools(List<AgentTool> registeredTools) {
        return aiAgentToolAccessService.resolveVisibleTools(registeredTools);
    }

    /** 按领域过滤 Agent 工具。 */
    public List<AgentTool> filterToolsByDomains(List<AgentTool> tools, Set<ToolDomain> domains) {
        return aiAgentToolAccessService.filterByDomains(tools, domains);
    }

    /**
     * 反馈回写结晶化技能（successCount / avgRating 更新）。
     *
     * <p>能力未启用或租户上下文缺失时**静默跳过**，异常也只记 debug —— 不影响主流程
     * （与重构前 Controller 内的行为逐字一致）。
     */
    public void recordSkillFeedbackQuietly(String commandId, Long tenantId, int score, String comment) {
        if (skillCrystallizationService == null || tenantId == null) {
            return;
        }
        try {
            skillCrystallizationService.recordFeedback(commandId, tenantId, score, comment);
        } catch (Exception e) {
            log.debug("[AiFeedback] 结晶化技能回写失败（不影响主流程）: {}", e.getMessage());
        }
    }
}
