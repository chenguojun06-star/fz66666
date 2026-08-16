package com.fashion.supplychain.intelligence.agent.handoff;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopCallback;
import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.service.SharedAgentMemoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.util.List;

@Slf4j
@Component
@Lazy
public class HandoffEngine {

    @Autowired private SubAgentRegistry subAgentRegistry;
    @Autowired private AiInferenceGateway inferenceGateway;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SharedAgentMemoryService> sharedAgentMemoryProvider;

    @Value("${xiaoyun.handoff.enabled:true}")
    private boolean handoffEnabled;

    @Value("${xiaoyun.handoff.min-confidence:0.6}")
    private double minConfidence;

    @Value("${xiaoyun.handoff.shared-memory.enabled:true}")
    private boolean sharedMemoryEnabled;

    public HandoffResult tryHandoff(String userMessage, AgentLoopContext ctx, AgentLoopCallback cb) {
        if (!handoffEnabled) return HandoffResult.noHandoff();

        SubAgentDefinition subAgent = subAgentRegistry.matchAgent(userMessage);
        if (subAgent == null) return HandoffResult.noHandoff();

        log.info("[Handoff] Delegating to sub-agent: {} for user: {}", subAgent.getName(),
                ctx.getUserId());

        cb.onThinking(0, "正在委派给" + subAgent.getName() + "分析…");

        try {
            String subAgentResult = runSubAgent(userMessage, subAgent, ctx);
            if (subAgentResult != null && !subAgentResult.isBlank()) {
                HandoffResult result = HandoffResult.success();
                result.setSubAgentName(subAgent.getName());
                result.setSubAgentResult(subAgentResult);
                result.setDelegated(true);
                log.info("[Handoff] Sub-agent {} completed successfully", subAgent.getName());
                return result;
            }

            log.warn("[Handoff] Sub-agent {} returned empty, falling back to main agent",
                    subAgent.getName());
            return HandoffResult.noHandoff();
        } catch (Exception e) {
            log.warn("[Handoff] Sub-agent {} failed: {}, falling back to main agent",
                    subAgent.getName(), e.getMessage());
            return HandoffResult.noHandoff();
        }
    }

    private String runSubAgent(String userMessage, SubAgentDefinition subAgent, AgentLoopContext ctx) {
        StringBuilder systemPrompt = new StringBuilder();
        systemPrompt.append(subAgent.getSystemPrompt()).append("\n\n");
        // 用真实姓名/角色而非数字ID，避免回复中出现"租户：2，用户：1005"这种生硬表述
        String userName = com.fashion.supplychain.common.UserContext.username();
        String userRole = com.fashion.supplychain.common.UserContext.role();
        systemPrompt.append("当前用户：").append(userName != null && !userName.isBlank() ? userName : "用户").append("\n");
        if (userRole != null && !userRole.isBlank()) {
            systemPrompt.append("用户角色：").append(userRole).append("\n");
        }
        systemPrompt.append("（注意：回复时用用户姓名称呼，禁止展示租户ID、用户ID等内部数字编号）\n");

        if (subAgent.getKnowledgeRefs() != null) {
            systemPrompt.append("\n可用知识库:\n");
            subAgent.getKnowledgeRefs().forEach((k, v) ->
                    systemPrompt.append("- ").append(k).append(": ").append(v).append("\n"));
        }

        // P0-3: 注入同会话内其他 Sub-Agent 已发现的事实（避免重复查询/事实冲突）
        String sharedFactsBlock = buildSharedFactsBlock(ctx);
        if (sharedFactsBlock != null && !sharedFactsBlock.isBlank()) {
            systemPrompt.append("\n").append(sharedFactsBlock);
        }

        var result = inferenceGateway.chat("handoff-" + subAgent.getAgentId(),
                systemPrompt.toString(), userMessage);

        if (result != null && result.isSuccess()) {
            String content = result.getContent();
            // P0-3: 写回 Sub-Agent 结果到共享记忆，供后续 Sub-Agent 复用
            writeSubAgentResultToSharedMemory(ctx, subAgent, content);
            return content;
        }
        return null;
    }

    /**
     * P0-3: 构建共享事实上下文块（注入 Sub-Agent systemPrompt）
     *
     * <p>读取同会话内其他 Sub-Agent 已写入的事实，避免重复查询和数据冲突。
     * <p>失败不影响主流程，异常吞掉仅 log.warn。
     */
    private String buildSharedFactsBlock(AgentLoopContext ctx) {
        if (!sharedMemoryEnabled) return null;
        if (ctx.getTenantId() == null || ctx.getCommandId() == null) return null;
        SharedAgentMemoryService service = sharedAgentMemoryProvider.getIfAvailable();
        if (service == null) return null;
        try {
            List<SharedAgentMemory> facts = service.readFacts(ctx.getTenantId(), ctx.getCommandId());
            if (facts == null || facts.isEmpty()) return null;
            StringBuilder sb = new StringBuilder();
            sb.append("[同会话共享事实 - 其他Agent已发现]\n");
            sb.append("以下是同会话内其他Agent已经查询和确认的事实，如与你的查询相关请直接复用，避免重复查询：\n\n");
            int idx = 0;
            for (SharedAgentMemory fact : facts) {
                if (fact.getFactValue() == null || fact.getFactValue().isBlank()) continue;
                sb.append(String.format("%d. [%s] %s = %s\n",
                        ++idx, fact.getAgentName(), fact.getFactKey(), truncate(fact.getFactValue(), 200)));
            }
            return idx == 0 ? null : sb.toString();
        } catch (Exception e) {
            log.warn("[Handoff] 读取共享事实失败(不影响主流程): {}", e.getMessage());
            return null;
        }
    }

    /**
     * P0-3: 写回 Sub-Agent 结果到共享记忆
     *
     * <p>factKey = "subagent_result_<agentId>"，便于后续 Sub-Agent 通过 key 直接读取
     * <p>confidence = 0.85（Sub-Agent LLM 输出，中等可信）
     * <p>失败不影响主流程，异常吞掉仅 log.warn
     */
    private void writeSubAgentResultToSharedMemory(AgentLoopContext ctx, SubAgentDefinition subAgent, String content) {
        if (!sharedMemoryEnabled) return;
        if (content == null || content.isBlank()) return;
        if (ctx.getTenantId() == null || ctx.getCommandId() == null) return;
        SharedAgentMemoryService service = sharedAgentMemoryProvider.getIfAvailable();
        if (service == null) return;
        try {
            String factKey = "subagent_result_" + subAgent.getAgentId();
            // 截断防止超大字段写入（共享记忆是会话级临时数据，不是完整记忆）
            String factValue = truncate(content, 1000);
            service.writeFact(ctx.getTenantId(), ctx.getCommandId(),
                    subAgent.getAgentId(), factKey, factValue, new BigDecimal("0.85"));
            log.debug("[Handoff] Sub-Agent 结果已写入共享记忆: agent={}, session={}",
                    subAgent.getAgentId(), ctx.getCommandId());
        } catch (Exception e) {
            log.warn("[Handoff] 写入共享记忆失败(不影响主流程): agent={}, err={}",
                    subAgent.getAgentId(), e.getMessage());
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }

    public static class HandoffResult {
        private boolean delegated;
        private String subAgentName;
        private String subAgentResult;

        public static HandoffResult noHandoff() {
            HandoffResult r = new HandoffResult();
            r.delegated = false;
            return r;
        }

        public static HandoffResult success() {
            HandoffResult r = new HandoffResult();
            r.delegated = true;
            return r;
        }

        public boolean isDelegated() { return delegated; }
        public void setDelegated(boolean delegated) { this.delegated = delegated; }
        public String getSubAgentName() { return subAgentName; }
        public void setSubAgentName(String subAgentName) { this.subAgentName = subAgentName; }
        public String getSubAgentResult() { return subAgentResult; }
        public void setSubAgentResult(String subAgentResult) { this.subAgentResult = subAgentResult; }
    }
}