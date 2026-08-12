package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.agent.planning.AgentPlan;
import com.fashion.supplychain.intelligence.dto.XiaoyunStructuredResponse;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.Builder;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

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

    /**
     * 上下文实体记忆（升级B）。
     * 记住用户最近提到的款号/订单号/工厂名/员工名等实体，
     * 当用户说"那个款呢""它的进度"时，能自动补全上下文。
     */
    @Builder.Default
    private final Map<String, String> contextEntities = new ConcurrentHashMap<>();

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

    /**
     * Per-call 模型选择（接入点4：AgentLoopEngine 在第一次 LLM 调用前设置）。
     * modelTier 为 null 表示使用默认模型（不进行 per-call 覆盖）。
     */
    @Getter
    private String modelTier;
    @Getter
    private String modelId;

    public void setModelTier(String modelTier) {
        this.modelTier = modelTier;
    }

    public void setModelId(String modelId) {
        this.modelId = modelId;
    }

    /** 是否已应用 per-call 模型选择 */
    public boolean hasModelSelection() {
        return modelId != null && !modelId.isBlank();
    }

    // ==================== Plan-and-Execute 计划跟踪 ====================

    /** 当前执行计划（Plan-and-Execute 模式） */
    @Getter
    private AgentPlan currentPlan;

    /** 已完成的步骤索引（从0开始） */
    @Builder.Default
    private int completedPlanSteps = 0;

    /** 重规划次数（防止无限重规划） */
    @Builder.Default
    private int replanCount = 0;

    /** 是否处于 Plan-and-Execute 模式 */
    public boolean isPlanAndExecuteMode() {
        return currentPlan != null && currentPlan.getSteps() != null && !currentPlan.getSteps().isEmpty();
    }

    public void setCurrentPlan(AgentPlan plan) {
        this.currentPlan = plan;
        this.completedPlanSteps = 0;
    }

    public void incrementCompletedSteps() {
        this.completedPlanSteps++;
    }

    public void incrementReplanCount() {
        this.replanCount++;
    }

    /** 获取计划总步骤数 */
    public int getTotalPlanSteps() {
        return currentPlan != null && currentPlan.getSteps() != null ? currentPlan.getSteps().size() : 0;
    }

    /** 获取计划完成百分比 */
    public int getPlanProgressPercent() {
        int total = getTotalPlanSteps();
        if (total == 0) return 0;
        return Math.min(100, (int) ((completedPlanSteps / (double) total) * 100));
    }

    private long deadlineMs;
    private AtomicBoolean cancelled;

    public void setDeadlineMs(long deadlineMs) {
        this.deadlineMs = deadlineMs;
    }

    public long getDeadlineMs() {
        return deadlineMs;
    }

    public void setCancelled(AtomicBoolean cancelled) {
        this.cancelled = cancelled;
    }

    public boolean isCancelled() {
        return cancelled != null && cancelled.get();
    }

    public boolean isDeadlineExceeded() {
        return deadlineMs > 0 && System.currentTimeMillis() > deadlineMs;
    }

    // ==================== 上下文实体记忆（升级B） ====================

    /**
     * 从用户消息中提取实体并存入上下文记忆。
     * 支持：款号(BR26xxx)、订单号、工厂名、员工名等。
     */
    public void extractAndStoreEntities(String message) {
        if (message == null || message.isBlank()) return;
        // 款号模式：2-3个大写字母+数字+字母混合（如 BR26C1S0574B）
        java.util.regex.Matcher styleMatcher = java.util.regex.Pattern.compile(
                "\\b([A-Z]{2,3}\\d{2,}[A-Z0-9]*)\\b").matcher(message);
        if (styleMatcher.find()) {
            contextEntities.put("lastStyleNo", styleMatcher.group(1));
        }
        // 订单号模式：32位hex 或 纯数字8位以上
        java.util.regex.Matcher orderMatcher = java.util.regex.Pattern.compile(
                "\\b([a-f0-9]{32}|\\d{8,})\\b").matcher(message);
        if (orderMatcher.find()) {
            contextEntities.put("lastOrderNo", orderMatcher.group(1));
        }
    }

    /**
     * 获取上下文实体描述（注入 system prompt）。
     * 当用户说"那个款""它的进度"时，提示 LLM 用记忆中的实体。
     */
    public String getContextEntityHint() {
        if (contextEntities.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("\n【上下文实体记忆】\n");
        String lastStyle = contextEntities.get("lastStyleNo");
        if (lastStyle != null) sb.append("- 用户最近提到的款号: ").append(lastStyle).append("\n");
        String lastOrder = contextEntities.get("lastOrderNo");
        if (lastOrder != null) sb.append("- 用户最近提到的订单号: ").append(lastOrder).append("\n");
        sb.append("当用户说'那个款''它的进度''那个订单'时，请使用上述实体。\n");
        return sb.toString();
    }

    /**
     * 指代消解：将用户消息中的"那个款""那个订单"替换为实际实体。
     */
    public String resolveCoreference(String message) {
        if (message == null || contextEntities.isEmpty()) return message;
        String resolved = message;
        String lastStyle = contextEntities.get("lastStyleNo");
        String lastOrder = contextEntities.get("lastOrderNo");
        if (lastStyle != null) {
            resolved = resolved.replaceAll("(?i)那个款|这个款|它(?!的)|该款", lastStyle);
        }
        if (lastOrder != null) {
            resolved = resolved.replaceAll("(?i)那个订单|这个订单|该订单", lastOrder);
        }
        return resolved;
    }
}
