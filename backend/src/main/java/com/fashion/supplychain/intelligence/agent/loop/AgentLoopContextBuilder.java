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
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@Lazy
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

    @Value("${xiaoyun.agent.max-iterations-hard-limit:10}")
    private int maxIterationsHardLimit;

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
        messages.add(AiMessage.system(promptHelper.buildSystemPrompt(userMessage, pageContext, visibleTools, isMultiDomain)));
        if (isMultiDomain && multiDomains.size() > 1) {
            String domainHint = "用户的问题涉及" + domainRouter.describeDomains(multiDomains)
                    + "多个领域，请综合分析各领域数据，给出跨域关联洞察。";
            messages.add(AiMessage.system(domainHint));
        }
        List<AiMessage> history = memoryHelper.getConversationHistory(userId, tenantId);
        // P0升级: token感知压缩 — 当历史对话超过token预算60%时自动触发三级压缩
        messages.addAll(memoryHelper.compactConversationHistory(history, tokenBudget));

        // 升级D：上下文窗口优化 — 从历史对话中提取实体，注入 system prompt
        StringBuilder contextEnhancements = new StringBuilder();
        for (AiMessage msg : history) {
            if (msg.getRole() != null && msg.getRole().contains("user") && msg.getContent() != null) {
                // 从历史用户消息中提取款号/订单号
                extractHistoryEntities(msg.getContent(), contextEnhancements);
            }
        }
        if (contextEnhancements.length() > 0) {
            messages.add(AiMessage.system("【上下文实体记忆】\n" + contextEnhancements.toString()
                    + "\n当用户说'那个款''它的进度'时，请使用上述实体。"));
        }

        // 升级B：指代消解 — 将"那个款""那个订单"替换为实际实体
        String resolvedMessage = resolveCoreferenceFromHistory(userMessage, history);
        messages.add(AiMessage.user(resolvedMessage));

        int maxIterations = promptHelper.estimateMaxIterations(userMessage);
        if (isMultiDomain) {
            int extraIterations = Math.max(0, multiDomains.size() - 1) * 2;
            maxIterations = maxIterations + extraIterations;
            log.info("[ContextBuilder] 多域查询提升maxIterations: {} → {}", maxIterations - extraIterations, maxIterations);
        }
        if (maxIterations > maxIterationsHardLimit) {
            log.warn("[ContextBuilder] maxIterations({})超过硬上限({})，已截断", maxIterations, maxIterationsHardLimit);
            maxIterations = maxIterationsHardLimit;
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

    // ==================== 升级B+D：上下文实体记忆 + 指代消解 ====================

    private static final java.util.regex.Pattern STYLE_NO_PATTERN =
            java.util.regex.Pattern.compile("\\b([A-Z]{2,3}\\d{2,}[A-Z0-9]*)\\b");
    private static final java.util.regex.Pattern ORDER_NO_PATTERN =
            java.util.regex.Pattern.compile("\\b([a-f0-9]{32}|\\d{8,})\\b");

    /**
     * 从历史用户消息中提取款号/订单号实体。
     */
    private void extractHistoryEntities(String message, StringBuilder sb) {
        if (message == null || message.isBlank()) return;
        java.util.regex.Matcher styleMatcher = STYLE_NO_PATTERN.matcher(message);
        if (styleMatcher.find()) {
            sb.append("- 用户最近提到的款号: ").append(styleMatcher.group(1)).append("\n");
        }
        java.util.regex.Matcher orderMatcher = ORDER_NO_PATTERN.matcher(message);
        if (orderMatcher.find()) {
            sb.append("- 用户最近提到的订单号: ").append(orderMatcher.group(1)).append("\n");
        }
    }

    /**
     * 指代消解：将"那个款""那个订单"替换为历史对话中最近提到的实体。
     */
    private String resolveCoreferenceFromHistory(String userMessage, List<AiMessage> history) {
        if (userMessage == null || history == null || history.isEmpty()) return userMessage;
        // 从最近的用户消息中找款号和订单号
        String lastStyleNo = null;
        String lastOrderNo = null;
        for (int i = history.size() - 1; i >= 0; i--) {
            AiMessage msg = history.get(i);
            if (msg.getRole() != null && msg.getRole().contains("user") && msg.getContent() != null) {
                if (lastStyleNo == null) {
                    java.util.regex.Matcher m = STYLE_NO_PATTERN.matcher(msg.getContent());
                    if (m.find()) lastStyleNo = m.group(1);
                }
                if (lastOrderNo == null) {
                    java.util.regex.Matcher m = ORDER_NO_PATTERN.matcher(msg.getContent());
                    if (m.find()) lastOrderNo = m.group(1);
                }
                if (lastStyleNo != null && lastOrderNo != null) break;
            }
        }
        String resolved = userMessage;
        if (lastStyleNo != null) {
            resolved = resolved.replaceAll("(?i)那个款|这个款|该款", lastStyleNo);
        }
        if (lastOrderNo != null) {
            resolved = resolved.replaceAll("(?i)那个订单|这个订单|该订单", lastOrderNo);
        }
        if (!resolved.equals(userMessage)) {
            log.info("[ContextBuilder] 指代消解: '{}' → '{}'", userMessage, resolved);
        }
        return resolved;
    }
}
