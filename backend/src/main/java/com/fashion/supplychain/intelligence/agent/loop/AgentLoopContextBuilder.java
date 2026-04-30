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
        if (!domains.isEmpty()) {
            visibleTools = aiAgentToolAccessService.filterByDomains(visibleTools, domains);
            log.info("[ContextBuilder] 领域路由裁剪: {} → {} 个工具", domains, visibleTools.size());
        }
        visibleTools = toolAdvisor.advise(visibleTools, userMessage);

        Map<String, AgentTool> visibleToolMap = toolExecHelper.toToolLookup(visibleTools);
        List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);

        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system(promptHelper.buildSystemPrompt(userMessage, pageContext, visibleTools)));
        List<AiMessage> history = memoryHelper.getConversationHistory(userId, tenantId);
        messages.addAll(memoryHelper.compactConversationHistory(history));
        messages.add(AiMessage.user(userMessage));

        int maxIterations = promptHelper.estimateMaxIterations(userMessage);

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
}
