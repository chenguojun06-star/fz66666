package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.dto.XiaoyunStructuredResponse;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.Builder;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Getter
@Builder
public class AgentLoopContext {

    private final String userMessage;
    private final String pageContext;
    private final String commandId;
    private final String stateSessionId;
    private final long requestStartAt;

    private final String userId;
    private final Long tenantId;

    private final List<AgentTool> visibleTools;
    private final Map<String, AgentTool> visibleToolMap;
    private final List<AiTool> visibleApiTools;
    private final Set<ToolDomain> routedDomains;

    private final List<AiMessage> messages;
    private final List<com.fasterxml.jackson.databind.JsonNode> teamDispatchCards;
    private final List<com.fasterxml.jackson.databind.JsonNode> bundleSplitCards;
    private final List<com.fasterxml.jackson.databind.JsonNode> stepWizardCards;
    private final List<com.fasterxml.jackson.databind.JsonNode> xiaoyunInsightCards;
    private final List<com.fasterxml.jackson.databind.JsonNode> reportPreviewCards;

    @Builder.Default
    private int currentIteration = 0;
    @Builder.Default
    private long totalTokens = 0;
    @Builder.Default
    private final List<String> stuckSignatures = new ArrayList<>();
    @Builder.Default
    private final Map<String, AiAgentToolExecHelper.ToolExecRecord> toolResultCache = new ConcurrentHashMap<>();
    @Builder.Default
    private final List<AiAgentToolExecHelper.ToolExecRecord> allExecRecords = new ArrayList<>();

    private final int maxIterations;
    private final long tokenBudget;

    public void incrementIteration() {
        this.currentIteration++;
    }

    public void addTokens(int promptTokens, int completionTokens) {
        this.totalTokens += promptTokens + completionTokens;
    }

    public boolean isTokenBudgetExceeded() {
        return this.totalTokens > this.tokenBudget;
    }

    public void addStuckSignatures(Set<String> sigs) {
        this.stuckSignatures.addAll(sigs);
    }

    public void addExecRecords(List<AiAgentToolExecHelper.ToolExecRecord> records) {
        this.allExecRecords.addAll(records);
    }

    public String getToolEvidence() {
        if (allExecRecords.isEmpty()) return "";
        return allExecRecords.stream()
                .map(r -> r.evidence)
                .reduce((a, b) -> a + " " + b)
                .orElse("");
    }

    @Getter
    private XiaoyunStructuredResponse structuredResponse;

    public void setStructuredResponse(XiaoyunStructuredResponse response) {
        this.structuredResponse = response;
    }
}
