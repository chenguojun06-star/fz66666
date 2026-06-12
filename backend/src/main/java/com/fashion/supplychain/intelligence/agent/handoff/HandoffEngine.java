package com.fashion.supplychain.intelligence.agent.handoff;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopCallback;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
public class HandoffEngine {

    @Autowired private SubAgentRegistry subAgentRegistry;
    @Autowired private AiInferenceGateway inferenceGateway;

    @Value("${xiaoyun.handoff.enabled:true}")
    private boolean handoffEnabled;

    @Value("${xiaoyun.handoff.min-confidence:0.6}")
    private double minConfidence;

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
        systemPrompt.append("当前租户: ").append(ctx.getTenantId()).append("\n");
        systemPrompt.append("用户身份: ").append(ctx.getUserId()).append("\n");

        if (subAgent.getKnowledgeRefs() != null) {
            systemPrompt.append("\n可用知识库:\n");
            subAgent.getKnowledgeRefs().forEach((k, v) ->
                    systemPrompt.append("- ").append(k).append(": ").append(v).append("\n"));
        }

        var result = inferenceGateway.chat("handoff-" + subAgent.getAgentId(),
                systemPrompt.toString(), userMessage);

        if (result != null && result.isSuccess()) {
            return result.getContent();
        }
        return null;
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