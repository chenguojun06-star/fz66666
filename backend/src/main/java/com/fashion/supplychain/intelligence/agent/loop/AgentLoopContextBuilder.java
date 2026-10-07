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
import java.util.LinkedHashSet;
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

    /**
     * D-761：单次对话 token 预算，30000 → 100000。
     * 30000 是 D-702 收敛轮数时代的配额；直查/会诊/证据包类工具上线后，
     * 正常问答一轮实测 33k~36k token，经常性撞墙，且撞墙文案与「日配额用完」相同，
     * 用户会误以为当天额度没了（线上实证：日配额才用 40% 却提示次数耗尽）。
     * 100000 = 实测超限值 3 倍余量；租户日配额 500k 下最坏 ~5 次失控大问题，可控。
     */
    @Value("${xiaoyun.agent.token-budget:100000}")
    private int tokenBudget;

    /**
     * D-702：迭代轮数硬上限，由 10 收敛到 5。
     *
     * <p>每一轮都是一次**同步** LLM 往返（实测 iter=2 达 20.8s），
     * 且工具调用收敛通常在 iter=2~3 就完成（toolCalls 归零即出答案）。
     * 上限 10 意味着最坏情况要把同样的流程跑10 遍，对交互式问答是不可接受的等待。
     * 5 轮足以覆盖「规划→取数→分析→复核」，同时把最坏等待压到可接受范围。
     */
    @Value("${xiaoyun.agent.max-iterations-hard-limit:5}")
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
        // ── D-702 性能修复：领域路由只算一次，其余从同一结果派生 ──
        //
        // 修复前是三行连续调用：route(...) → 内部再调 routeMulti(...)，
        // 然后 routeMulti(...)、isMultiDomain(...) 又各取一次。
        // 新问题缓存必然 miss，于是首个请求要把领域判定重复跑多遍。
        //
        // 现在：只调一次 routeMulti，其余从同一结果派生。
        // domains 取首个域 —— 与原 route() 的语义完全一致
        //（原实现就是 multi.domains.get(0)），isMultiDomain 即 domains.size() > 1。
        // 领域判定结果**逐项等价**，只是不再重复计算。
        List<ToolDomain> multiDomains = domainRouter.routeMulti(userMessage);
        Set<ToolDomain> domains = new LinkedHashSet<>();
        if (multiDomains != null && !multiDomains.isEmpty()) {
            domains.add(multiDomains.get(0));
        }
        boolean isMultiDomain = multiDomains != null && multiDomains.size() > 1;
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
            // ── D-702 性能修复：提升幅度与硬上限一并收敛 ──
            //
            // 修复前：每多一个域 +2 轮，且 extraIterations 可把 3 轮推到 5 轮甚至 7 轮。
            // 问题有二：
            //  1. **轮数上限越高，模型"可能多跑一轮"的代价越大**。实测一次提问在
            //     iter=2 就已 toolCalls=0 出答案（收敛完成），多给的轮次并未用到，
            //     但每轮都是一次同步 LLM 往返（iter=2 耗时 20.8s）。
            //  2. 多域判定来自领域路由，而 D-702 优化后关键词命中即判多域，
            //     会让"成本+订单"这类**两个词就能确定**的问题也被提升轮数。
            //
            // 现在：每域只 +1 轮，并把硬上限从「无约束」收敛到明确值，
            // 保证极端多域问题也不会把等待时间放大到不可接受。
            int extraIterations = Math.max(0, multiDomains.size() - 1);
            maxIterations = maxIterations + extraIterations;
            log.info("[ContextBuilder] 多域查询提升maxIterations: {} → {} (域数={})",
                    maxIterations - extraIterations, maxIterations, multiDomains.size());
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
