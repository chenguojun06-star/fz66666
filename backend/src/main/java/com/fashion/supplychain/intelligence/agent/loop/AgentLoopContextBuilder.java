package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.routing.AiAgentDomainRouter;
import com.fashion.supplychain.intelligence.routing.AiAgentToolAdvisor;
import com.fashion.supplychain.intelligence.service.AgentStateStore;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
public class AgentLoopContextBuilder {

    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiAgentPromptHelper promptHelper;
    @Autowired private AiAgentToolExecHelper toolExecHelper;
    @Autowired private AiAgentMemoryHelper memoryHelper;
    @Autowired private AiAgentDomainRouter domainRouter;
    @Autowired private AiAgentToolAdvisor toolAdvisor;
    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private AgentStateStore agentStateStore;
    @Autowired private List<AgentTool> registeredTools;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.orchestration.MultiAgentGraphOrchestrator multiAgentGraphOrchestrator;

    @Value("${xiaoyun.agent.token-budget:30000}")
    private int tokenBudget;

    public AgentLoopContext build(String userMessage, String pageContext) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();

        String commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
        String stateSessionId = null;
        try {
            stateSessionId = agentStateStore.createSession(tenantId, userId, userMessage);
        } catch (Exception e) {
            log.debug("[ContextBuilder] 状态会话创建跳过: {}", e.getMessage());
        }

        List<AgentTool> visibleTools = aiAgentToolAccessService.resolveVisibleTools(registeredTools);
        Set<ToolDomain> domains = domainRouter.route(userMessage);
        List<ToolDomain> multiDomains = domainRouter.routeMulti(userMessage);
        boolean isMultiDomain = domainRouter.isMultiDomain(userMessage);
        if (!domains.isEmpty()) {
            visibleTools = aiAgentToolAccessService.filterByDomains(visibleTools, domains);
            log.info("[ContextBuilder] 领域路由裁剪: {} → {} 个工具", domains, visibleTools.size());
        }
        visibleTools = toolAdvisor.advise(visibleTools, userMessage);

        Map<String, AgentTool> visibleToolMap = toolExecHelper.toToolLookup(visibleTools);
        List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);
        visibleApiTools.sort(java.util.Comparator.comparing(t -> t.getFunction().getName()));

        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system(promptHelper.buildSystemPrompt(userMessage, pageContext, visibleTools)));
        if (isMultiDomain && multiDomains.size() > 1) {
            String domainHint = "用户的问题涉及" + domainRouter.describeDomains(multiDomains)
                    + "多个领域，请综合分析各领域数据，给出跨域关联洞察。";
            messages.add(AiMessage.system(domainHint));
            String masInsight = buildLightweightMasInsight(userMessage, tenantId);
            if (masInsight != null && !masInsight.isBlank()) {
                messages.add(AiMessage.system(masInsight));
            }
        }
        List<AiMessage> history = memoryHelper.getConversationHistory(userId, tenantId);
        messages.addAll(memoryHelper.compactConversationHistory(history));
        messages.add(AiMessage.user(userMessage));

        int maxIterations = promptHelper.estimateMaxIterations(userMessage);
        if (isMultiDomain) {
            int extraIterations = Math.max(0, multiDomains.size() - 1) * 2;
            maxIterations = maxIterations + extraIterations;
            log.info("[ContextBuilder] 多域查询提升maxIterations: {} → {}", maxIterations - extraIterations, maxIterations);
        }

        return AgentLoopContext.builder()
                .userMessage(userMessage)
                .pageContext(pageContext)
                .commandId(commandId)
                .stateSessionId(stateSessionId)
                .requestStartAt(System.currentTimeMillis())
                .userId(userId)
                .tenantId(tenantId)
                .visibleTools(visibleTools)
                .visibleToolMap(visibleToolMap)
                .visibleApiTools(visibleApiTools)
                .routedDomains(domains)
                .messages(messages)
                .teamDispatchCards(new ArrayList<>())
                .bundleSplitCards(new ArrayList<>())
                .stepWizardCards(new ArrayList<>())
                .xiaoyunInsightCards(new ArrayList<>())
                .reportPreviewCards(new ArrayList<>())
                .maxIterations(maxIterations)
                .tokenBudget(tokenBudget)
                .build();
    }

    public boolean isModelEnabled() {
        return inferenceOrchestrator.isAnyModelEnabled();
    }

    private String buildLightweightMasInsight(String userMessage, Long tenantId) {
        if (multiAgentGraphOrchestrator == null) return "";
        try {
            com.fashion.supplychain.intelligence.dto.MultiAgentRequest req =
                    new com.fashion.supplychain.intelligence.dto.MultiAgentRequest();
            req.setQuestion(userMessage);
            req.setScene("quick");
            long masStart = System.currentTimeMillis();
            com.fashion.supplychain.intelligence.dto.GraphExecutionResult result =
                    multiAgentGraphOrchestrator.runGraph(req);
            long masLatency = System.currentTimeMillis() - masStart;
            if (result == null || !result.isSuccess()) {
                log.debug("[ContextBuilder-MAS] MAS分析未成功: latency={}ms", masLatency);
                return "";
            }
            StringBuilder insight = new StringBuilder();
            insight.append("【多Agent专家分析（").append(masLatency).append("ms）】\n");
            if (result.getOptimizationSuggestion() != null && !result.getOptimizationSuggestion().isBlank()) {
                insight.append("综合建议：").append(result.getOptimizationSuggestion()).append("\n");
            }
            if (result.getSpecialistResults() != null && !result.getSpecialistResults().isEmpty()) {
                insight.append("各领域专家分析：\n");
                result.getSpecialistResults().forEach((domain, analysis) -> {
                    String truncated = analysis != null && analysis.length() > 300
                            ? analysis.substring(0, 300) + "…" : analysis;
                    insight.append("- [").append(domain).append("] ").append(truncated).append("\n");
                });
            }
            insight.append("（以上为多Agent专家系统的预分析，请结合工具查询的实时数据综合判断）\n");
            log.info("[ContextBuilder-MAS] MAS分析注入成功: route={} confidence={} latency={}ms",
                    result.getRoute(), result.getConfidenceScore(), masLatency);
            return insight.toString();
        } catch (Exception e) {
            log.debug("[ContextBuilder-MAS] MAS分析跳过: {}", e.getMessage());
            return "";
        }
    }
}
