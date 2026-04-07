#!/usr/bin/env python3
"""Split AiAgentOrchestrator.java (1167 lines) into 3 helpers + slim orchestrator."""
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src/main/java/com/fashion/supplychain/intelligence")
HELPER_DIR = os.path.join(SRC, "helper")
ORCH_DIR = os.path.join(SRC, "orchestration")
os.makedirs(HELPER_DIR, exist_ok=True)

# ═══════════════════════════════════════════════════════════
# 1) AiAgentMemoryHelper.java  (~130 lines)
# ═══════════════════════════════════════════════════════════
with open(os.path.join(HELPER_DIR, "AiAgentMemoryHelper.java"), "w") as f:
    f.write(r'''package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
public class AiAgentMemoryHelper {

    private static final int MAX_MEMORY_TURNS = 6;
    private static final int MAX_USERS_CACHED = 200;
    private static final int COMPACT_THRESHOLD_TURNS = 8;

    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;

    private final Map<String, List<AiMessage>> conversationMemory = Collections.synchronizedMap(
            new LinkedHashMap<String, List<AiMessage>>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, List<AiMessage>> eldest) {
                    return size() > MAX_USERS_CACHED;
                }
            });

    private final ExecutorService memoryExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "ai-memory-enhance");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    public void shutdown() {
        memoryExecutor.shutdownNow();
    }

    public List<AiMessage> getConversationHistory(String userId) {
        if (userId == null || userId.isBlank()) return List.of();
        List<AiMessage> history = conversationMemory.get(userId);
        if (history == null) return List.of();
        synchronized (history) {
            return new ArrayList<>(history);
        }
    }

    public void saveConversationTurn(String userId, String userMsg, String assistantMsg) {
        List<AiMessage> history = conversationMemory.computeIfAbsent(userId, k -> new ArrayList<>());
        synchronized (history) {
            history.add(AiMessage.user(userMsg));
            history.add(AiMessage.assistant(assistantMsg));
            while (history.size() > MAX_MEMORY_TURNS * 2) {
                history.remove(0);
            }
        }
    }

    public List<AiMessage> compactConversationHistory(List<AiMessage> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        int turnCount = history.size() / 2;
        if (turnCount <= COMPACT_THRESHOLD_TURNS) {
            return new ArrayList<>(history);
        }
        int keepMessages = 4;
        List<AiMessage> recentMessages = history.subList(history.size() - keepMessages, history.size());
        List<AiMessage> olderMessages = history.subList(0, history.size() - keepMessages);

        StringBuilder olderText = new StringBuilder();
        for (AiMessage msg : olderMessages) {
            String role = msg.getRole() == null ? "unknown" : msg.getRole();
            String content = msg.getContent() == null ? "" : msg.getContent();
            olderText.append("[").append(role).append("] ").append(AiAgentEvidenceHelper.truncate(content, 500)).append("\n");
        }

        try {
            List<AiMessage> compactPrompt = List.of(
                    AiMessage.system("你是对话摘要助手。将以下多轮对话压缩为一段简要上下文摘要（中文，150字以内），保留关键实体（订单号、款号、工厂名、金额）和用户意图。"),
                    AiMessage.user(olderText.toString())
            );
            IntelligenceInferenceResult compactResult = inferenceOrchestrator.chat("history-compact", compactPrompt, List.of());
            if (compactResult.isSuccess() && compactResult.getContent() != null) {
                List<AiMessage> result = new ArrayList<>();
                result.add(AiMessage.system("[对话上下文摘要] " + compactResult.getContent()));
                result.addAll(recentMessages);
                log.info("[AiAgent] 会话历史压缩：{} 条 → 1条摘要 + {} 条近期", olderMessages.size(), recentMessages.size());
                return result;
            }
        } catch (Exception e) {
            log.warn("[AiAgent] 会话历史压缩失败，回退全量: {}", e.getMessage());
        }
        return new ArrayList<>(history);
    }

    public void saveCurrentConversationToMemory(String userId, Long tenantId) {
        List<AiMessage> history = getConversationHistory(userId);
        if (!history.isEmpty()) {
            aiMemoryOrchestrator.saveConversation(userId, tenantId, history);
        }
    }

    public void enhanceMemoryAsync(String userId, String userMessage, String assistantResponse) {
        CompletableFuture.runAsync(() -> {
            try {
                if (assistantResponse == null || assistantResponse.length() < 80) {
                    return;
                }
                List<AiMessage> extractPrompt = List.of(
                        AiMessage.system("你是知识提取助手。分析以下对话，如果其中包含有价值的业务洞察（如决策依据、" +
                                "异常处理方案、数据分析结论），则输出一行标题和一段摘要，格式:\n" +
                                "TITLE: 标题\nCONTENT: 摘要\n\n" +
                                "如果对话是简单闲聊/查询且无新洞察，仅输出 SKIP"),
                        AiMessage.user("用户: " + AiAgentEvidenceHelper.truncate(userMessage, 300) + "\n助手: " + AiAgentEvidenceHelper.truncate(assistantResponse, 600))
                );
                IntelligenceInferenceResult extractResult = inferenceOrchestrator.chat("memory-extract", extractPrompt, List.of());
                if (!extractResult.isSuccess() || extractResult.getContent() == null) {
                    return;
                }
                String extraction = extractResult.getContent().trim();
                if (extraction.startsWith("SKIP") || !extraction.contains("TITLE:")) {
                    return;
                }
                String title = "";
                String content = "";
                for (String line : extraction.split("\n")) {
                    if (line.startsWith("TITLE:")) {
                        title = line.substring(6).trim();
                    } else if (line.startsWith("CONTENT:")) {
                        content = line.substring(8).trim();
                    }
                }
                if (title.isEmpty() || content.isEmpty()) {
                    return;
                }
                intelligenceMemoryOrchestrator.saveCase("agent_insight", "conversation", title, content);
                log.info("[AiAgent] 记忆增强成功: title={}, userId={}", title, userId);
            } catch (Exception e) {
                log.debug("[AiAgent] 记忆增强异常（不影响主流程）: {}", e.getMessage());
            }
        }, memoryExecutor);
    }
}
''')

print("✅ AiAgentMemoryHelper.java created")

# ═══════════════════════════════════════════════════════════
# 2) AiAgentEvidenceHelper.java  (~280 lines)
# ═══════════════════════════════════════════════════════════
with open(os.path.join(HELPER_DIR, "AiAgentEvidenceHelper.java"), "w") as f:
    f.write(r'''package com.fashion.supplychain.intelligence.helper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
public class AiAgentEvidenceHelper {

    private static final ObjectMapper JSON = new ObjectMapper();
    public static final int MAX_TOOL_RAW_CHARS = 3000;

    public String buildToolEvidenceMessage(String toolName, String toolResult) {
        if (toolResult == null || toolResult.isBlank()) {
            return "【工具证据】\n- 工具: " + toolName + "\n- 结果: 空结果";
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (root.hasNonNull("error")) {
                return "【工具证据】\n- 工具: " + toolName + "\n- 状态: 失败\n- 错误: " + truncate(root.path("error").asText(), 400);
            }

            StringBuilder evidence = new StringBuilder("【工具证据】\n- 工具: ").append(toolName).append("\n");

            if ("tool_knowledge_search".equals(toolName)) {
                appendKnowledgeEvidence(evidence, root);
            } else if ("tool_whatif".equals(toolName)) {
                appendWhatIfEvidence(evidence, root);
            } else if ("tool_multi_agent".equals(toolName)) {
                appendMultiAgentEvidence(evidence, root);
            } else {
                appendGenericEvidence(evidence, root);
            }

            int rawLimit = resolveRawExcerptLimit(toolName);
            if (rawLimit > 0) {
                String raw = toolResult.length() > rawLimit ? toolResult.substring(0, rawLimit) + "…(截断)" : toolResult;
                evidence.append("- 原始数据: ").append(raw).append("\n");
            }
            return evidence.toString();
        } catch (Exception e) {
            log.debug("[AiAgent] 工具证据构建回退原始文本: tool={}", toolName);
            return "【工具证据】\n- 工具: " + toolName + "\n- 原始结果: " + truncate(toolResult, MAX_TOOL_RAW_CHARS);
        }
    }

    private void appendKnowledgeEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 检索模式: ").append(root.path("retrievalMode").asText("hybrid")).append("\n");
        evidence.append("- 命中: ").append(root.path("count").asInt(0))
                .append("条（语义").append(root.path("semanticHits").asInt(0))
                .append("/关键词").append(root.path("keywordHits").asInt(0)).append("）\n");

        JsonNode items = root.path("items");
        if (items.isArray()) {
            for (int i = 0; i < Math.min(items.size(), 3); i++) {
                JsonNode item = items.get(i);
                evidence.append("  ").append(i + 1).append(". ")
                        .append(item.path("title").asText("无标题"))
                        .append("（分类: ").append(item.path("category").asText(""))
                        .append("，混合分: ").append(String.format("%.2f", item.path("hybridScore").asDouble(0d)))
                        .append("，语义分: ").append(String.format("%.2f", item.path("semanticScore").asDouble(0d)))
                        .append("，关键词分: ").append(String.format("%.2f", item.path("keywordScore").asDouble(0d)))
                        .append("）\n  内容: ").append(truncate(item.path("content").asText(""), 90)).append("\n");
            }
        }
    }

    private void appendWhatIfEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 摘要: ").append(truncate(root.path("summary").asText(""), 120)).append("\n");
        evidence.append("- 推荐方案: ").append(root.path("recommended").asText("无")).append("\n");

        JsonNode baseline = root.path("baseline");
        if (!baseline.isMissingNode() && !baseline.isNull()) {
            evidence.append("- 基线: ").append(baseline.path("desc").asText(baseline.path("key").asText("当前方案")))
                    .append("，评分").append(String.format("%.0f", baseline.path("score").asDouble(0d))).append("\n");
        }

        JsonNode scenarios = root.path("scenarios");
        if (scenarios.isArray()) {
            for (int i = 0; i < Math.min(scenarios.size(), 3); i++) {
                JsonNode scenario = scenarios.get(i);
                evidence.append("- 方案").append(i + 1).append(": ")
                        .append(scenario.path("desc").asText(scenario.path("key").asText("scenario")))
                        .append("，评分").append(String.format("%.0f", scenario.path("score").asDouble(0d)))
                        .append("，完工变化").append(scenario.path("finishDeltaDays").asInt(0)).append("天")
                        .append("，成本变化").append(scenario.path("costDelta").asDouble(0d))
                        .append("，风险变化").append(scenario.path("riskDelta").asDouble(0d))
                        .append("，动作: ").append(truncate(scenario.path("action").asText(""), 60))
                        .append("\n");
            }
        }
    }

    public void captureTeamDispatchCard(String toolName, String toolResult, List<JsonNode> teamDispatchCards) {
        if (!"tool_team_dispatch".equals(toolName) || toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (!root.path("success").asBoolean(false)) {
                return;
            }
            teamDispatchCards.add(root);
        } catch (Exception e) {
            log.debug("[AiAgent] 解析协同派单结果失败: {}", e.getMessage());
        }
    }

    public String appendTeamDispatchCards(String content, List<JsonNode> teamDispatchCards) {
        if (teamDispatchCards == null || teamDispatchCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(teamDispatchCards);
            return (content == null ? "" : content) + "\n\n【TEAM_STATUS】" + json + "【/TEAM_STATUS】";
        } catch (Exception e) {
            log.debug("[AiAgent] 拼接协同状态卡失败: {}", e.getMessage());
            return content;
        }
    }

    public void captureBundleSplitCard(String toolName, String toolResult, List<JsonNode> bundleSplitCards) {
        if (!"tool_bundle_split_transfer".equals(toolName) || toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (!root.path("success").asBoolean(false)) {
                return;
            }
            bundleSplitCards.add(root);
        } catch (Exception e) {
            log.debug("[AiAgent] 解析拆菲转派结果失败: {}", e.getMessage());
        }
    }

    public String appendBundleSplitCards(String content, List<JsonNode> bundleSplitCards) {
        if (bundleSplitCards == null || bundleSplitCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(bundleSplitCards);
            return (content == null ? "" : content) + "\n\n【BUNDLE_SPLIT】" + json + "【/BUNDLE_SPLIT】";
        } catch (Exception e) {
            log.debug("[AiAgent] 拼接拆菲转派卡失败: {}", e.getMessage());
            return content;
        }
    }

    private void appendMultiAgentEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 路由场景: ").append(root.path("route").asText("unknown")).append("\n");
        if (root.hasNonNull("context")) {
            evidence.append("- 上下文摘要: ").append(truncate(root.path("context").asText(), 120)).append("\n");
        }
        if (root.hasNonNull("reflection")) {
            evidence.append("- 反思结论: ").append(truncate(root.path("reflection").asText(), 120)).append("\n");
        }
        if (root.hasNonNull("optimization")) {
            evidence.append("- 优化建议: ").append(truncate(root.path("optimization").asText(), 120)).append("\n");
        }
        JsonNode specialists = root.path("specialists");
        if (specialists != null && specialists.isObject()) {
            List<String> names = new ArrayList<>();
            specialists.fieldNames().forEachRemaining(names::add);
            if (!names.isEmpty()) {
                evidence.append("- 专家输出: ").append(String.join(", ", names)).append("\n");
            }
        }
    }

    private void appendGenericEvidence(StringBuilder evidence, JsonNode root) {
        if (root.hasNonNull("summary")) {
            evidence.append("- 摘要: ").append(truncate(root.path("summary").asText(), 120)).append("\n");
        } else if (root.hasNonNull("message")) {
            evidence.append("- 消息: ").append(truncate(root.path("message").asText(), 120)).append("\n");
        }

        JsonNode countNode = root.path("count");
        if (countNode.isNumber()) {
            evidence.append("- 数量: ").append(countNode.asInt()).append("\n");
        }

        JsonNode items = root.path("items");
        if (items.isArray() && items.size() > 0) {
            for (int i = 0; i < Math.min(items.size(), 3); i++) {
                JsonNode item = items.get(i);
                evidence.append("- 条目").append(i + 1).append(": ")
                        .append(extractBestLabel(item)).append("\n");
            }
        } else {
            List<String> keys = new ArrayList<>();
            root.fieldNames().forEachRemaining(keys::add);
            if (!keys.isEmpty()) {
                evidence.append("- 顶层字段: ").append(String.join(", ", keys.subList(0, Math.min(keys.size(), 8)))).append("\n");
            }
        }
    }

    private String extractBestLabel(JsonNode item) {
        if (item == null || item.isMissingNode() || item.isNull()) {
            return "空条目";
        }
        String[] fields = new String[] {"title", "name", "orderNo", "order_no", "styleNo", "sku", "summary", "desc"};
        for (String field : fields) {
            String value = item.path(field).asText("").trim();
            if (!value.isEmpty()) {
                return truncate(value, 90);
            }
        }
        return truncate(item.toString(), 90);
    }

    public static String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    public static String truncateOneLine(String text, int maxLength) {
        return truncate(text == null ? "" : text.replace("\n", " ").replace("\r", " "), maxLength);
    }

    private int resolveRawExcerptLimit(String toolName) {
        if ("tool_multi_agent".equals(toolName)) {
            return 0;
        }
        if ("tool_whatif".equals(toolName) || "tool_knowledge_search".equals(toolName)) {
            return 800;
        }
        return MAX_TOOL_RAW_CHARS;
    }
}
''')

print("✅ AiAgentEvidenceHelper.java created")

# ═══════════════════════════════════════════════════════════
# 3) AiAgentToolExecHelper.java  (~280 lines)
# ═══════════════════════════════════════════════════════════
with open(os.path.join(HELPER_DIR, "AiAgentToolExecHelper.java"), "w") as f:
    f.write(r'''package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.hook.ToolExecutionHook;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AiAgentToolExecHelper {

    private static final int STUCK_MAX_REPEAT = 3;

    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private List<AgentTool> registeredTools;
    @Autowired(required = false) private List<ToolExecutionHook> toolHooks;

    private Map<String, AgentTool> toolMap;

    private final ExecutorService toolExecutor = new ThreadPoolExecutor(
            4, 8, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            new ThreadFactory() {
                private final AtomicInteger seq = new AtomicInteger(1);
                @Override
                public Thread newThread(Runnable r) {
                    Thread t = new Thread(r, "ai-tool-" + seq.getAndIncrement());
                    t.setDaemon(true);
                    return t;
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    @PostConstruct
    public void init() {
        toolMap = new HashMap<>();
        if (registeredTools != null) {
            for (AgentTool tool : registeredTools) {
                toolMap.put(tool.getName(), tool);
                log.info("[AiAgent] 已注册工具: {}", tool.getName());
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        toolExecutor.shutdown();
        try {
            if (!toolExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.warn("[AiAgent] 工具线程池 5s 内未关闭，强制终止");
                toolExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            toolExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public Map<String, AgentTool> getToolMap() {
        return toolMap;
    }

    public Map<String, AgentTool> toToolLookup(List<AgentTool> visibleTools) {
        return visibleTools.stream().collect(Collectors.toMap(AgentTool::getName, tool -> tool));
    }

    public String buildUnavailableToolResult(String toolName) {
        if (toolMap.containsKey(toolName) && !aiAgentToolAccessService.canUseTool(toolName)) {
            return "{\"error\":\"当前角色无权使用工具: " + toolName + "\"}";
        }
        return "{\"error\":\"未知工具: " + toolName + "\"}";
    }

    /** 工具执行结果记录（内部数据结构） */
    public static class ToolExecRecord {
        public final String toolCallId;
        public final String toolName;
        public final String args;
        public final String rawResult;
        public final String evidence;
        public final long elapsedMs;

        public ToolExecRecord(String toolCallId, String toolName, String args,
                       String rawResult, String evidence, long elapsedMs) {
            this.toolCallId = toolCallId;
            this.toolName = toolName;
            this.args = args;
            this.rawResult = rawResult;
            this.evidence = evidence;
            this.elapsedMs = elapsedMs;
        }
    }

    public List<ToolExecRecord> executeToolsConcurrently(
            List<AiToolCall> toolCalls,
            Map<String, AgentTool> visibleToolMap,
            String commandId,
            Map<String, ToolExecRecord> toolResultCache) {

        if (toolCalls.size() == 1) {
            AiToolCall tc = toolCalls.get(0);
            String cacheKey = tc.getFunction().getName() + ":" + tc.getFunction().getArguments();
            ToolExecRecord cached = toolResultCache.get(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Cache] 工具缓存命中: {}", tc.getFunction().getName());
                return List.of(new ToolExecRecord(tc.getId(), cached.toolName, cached.args,
                        cached.rawResult, cached.evidence, 0));
            }
            ToolExecRecord rec = executeSingleTool(tc, visibleToolMap, commandId);
            toolResultCache.put(cacheKey, rec);
            return List.of(rec);
        }

        List<CompletableFuture<ToolExecRecord>> futures = new ArrayList<>();
        for (AiToolCall toolCall : toolCalls) {
            String cacheKey = toolCall.getFunction().getName() + ":" + toolCall.getFunction().getArguments();
            ToolExecRecord cached = toolResultCache.get(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Cache] 工具缓存命中: {}", toolCall.getFunction().getName());
                ToolExecRecord cachedCopy = new ToolExecRecord(toolCall.getId(), cached.toolName,
                        cached.args, cached.rawResult, cached.evidence, 0);
                futures.add(CompletableFuture.completedFuture(cachedCopy));
            } else {
                futures.add(CompletableFuture.supplyAsync(
                        () -> executeSingleTool(toolCall, visibleToolMap, commandId),
                        toolExecutor));
            }
        }

        List<ToolExecRecord> records = new ArrayList<>();
        for (CompletableFuture<ToolExecRecord> future : futures) {
            try {
                ToolExecRecord rec = future.join();
                records.add(rec);
                String cacheKey = rec.toolName + ":" + rec.args;
                toolResultCache.putIfAbsent(cacheKey, rec);
            } catch (Exception e) {
                log.error("[AiAgent] 并发工具执行异常: {}", e.getMessage());
                records.add(new ToolExecRecord("err", "unknown", "",
                        "{\"error\":\"工具执行异常: " + e.getMessage() + "\"}",
                        "【工具证据】\n- 状态: 异常\n- 错误: " + e.getMessage(), 0));
            }
        }
        return records;
    }

    private ToolExecRecord executeSingleTool(AiToolCall toolCall,
                                             Map<String, AgentTool> visibleToolMap,
                                             String commandId) {
        String toolName = toolCall.getFunction().getName();
        String arguments = toolCall.getFunction().getArguments();
        String toolCallId = toolCall.getId();
        long start = System.currentTimeMillis();
        String rawResult;
        boolean success = false;

        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    if (!hook.preToolUse(toolName, arguments)) {
                        log.info("[AiAgent] Hook 拦截工具调用: {}", toolName);
                        rawResult = "{\"error\":\"工具调用被安全策略拦截: " + toolName + "\"}";
                        long elapsed = System.currentTimeMillis() - start;
                        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult,
                                evidenceHelper.buildToolEvidenceMessage(toolName, rawResult), elapsed);
                    }
                } catch (Exception e) {
                    log.warn("[AiAgent] preToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        AgentTool tool = visibleToolMap.get(toolName);
        if (tool != null) {
            try {
                rawResult = tool.execute(arguments);
                success = true;
            } catch (Exception e) {
                if (isTransientError(e)) {
                    log.warn("[AiAgent] 工具瞬态异常，500ms 后重试: tool={}, error={}", toolName, e.getMessage());
                    try {
                        Thread.sleep(500);
                        rawResult = tool.execute(arguments);
                        success = true;
                    } catch (Exception retryEx) {
                        log.error("[AiAgent] 工具重试仍失败: tool={}, error={}", toolName, retryEx.getMessage());
                        rawResult = "{\"error\":\"工具执行异常(重试后): " + retryEx.getMessage() + "\"}";
                    }
                } else {
                    log.error("[AiAgent] 工具执行异常: tool={}, error={}", toolName, e.getMessage());
                    rawResult = "{\"error\":\"工具执行异常: " + e.getMessage() + "\"}";
                }
            }
        } else {
            rawResult = buildUnavailableToolResult(toolName);
        }

        long elapsed = System.currentTimeMillis() - start;

        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    hook.postToolUse(toolName, arguments, rawResult, elapsed, success);
                } catch (Exception e) {
                    log.warn("[AiAgent] postToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        try {
            aiAgentTraceOrchestrator.logToolCall(commandId, toolName, arguments, rawResult, elapsed, true);
        } catch (Exception e) {
            log.debug("[AiAgent] trace logToolCall 失败: {}", e.getMessage());
        }

        String evidence = evidenceHelper.buildToolEvidenceMessage(toolName, rawResult);
        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult, evidence, elapsed);
    }

    private boolean isTransientError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) return false;
        String lower = msg.toLowerCase();
        return lower.contains("timeout") || lower.contains("timed out")
            || lower.contains("connection reset") || lower.contains("connection refused")
            || lower.contains("429") || lower.contains("too many requests")
            || lower.contains("503") || lower.contains("service unavailable")
            || lower.contains("502") || lower.contains("bad gateway");
    }

    public String buildStuckSignature(AiToolCall toolCall) {
        String name = toolCall.getFunction() == null ? "?" : toolCall.getFunction().getName();
        String args = toolCall.getFunction() == null ? "" : String.valueOf(
                toolCall.getFunction().getArguments() == null ? "" : toolCall.getFunction().getArguments());
        return name + "|" + args.hashCode();
    }

    public boolean isStuck(List<String> signatures) {
        if (signatures.size() < STUCK_MAX_REPEAT) {
            return false;
        }
        int sz = signatures.size();
        String last = signatures.get(sz - 1);
        boolean exactRepeat = true;
        for (int i = sz - STUCK_MAX_REPEAT; i < sz; i++) {
            if (!last.equals(signatures.get(i))) { exactRepeat = false; break; }
        }
        if (exactRepeat) return true;

        if (sz >= 4) {
            String lastTool = signatures.get(sz - 1).split("\\|", 2)[0];
            boolean sameToolRepeat = true;
            for (int i = sz - 4; i < sz; i++) {
                if (!lastTool.equals(signatures.get(i).split("\\|", 2)[0])) {
                    sameToolRepeat = false; break;
                }
            }
            if (sameToolRepeat) {
                log.warn("[AiAgent] Stuck: 同一工具 {} 连续调用 4 次（参数不同）", lastTool);
                return true;
            }
        }

        if (sz >= 4) {
            String a = signatures.get(sz - 4);
            String b = signatures.get(sz - 3);
            if (!a.equals(b) && a.equals(signatures.get(sz - 2)) && b.equals(signatures.get(sz - 1))) {
                log.warn("[AiAgent] Stuck: A-B-A-B 振荡检测 ({} ↔ {})", a, b);
                return true;
            }
        }
        return false;
    }
}
''')

print("✅ AiAgentToolExecHelper.java created")

# ═══════════════════════════════════════════════════════════
# 4) Read original file to extract buildSystemPrompt verbatim
# ═══════════════════════════════════════════════════════════
orig_path = os.path.join(ORCH_DIR, "AiAgentOrchestrator.java")
with open(orig_path, "r") as f:
    orig_lines = f.readlines()

# Find the buildSystemPrompt method body (lines ~403-636 in file)
# We need the exact text from line "    private String buildSystemPrompt" to "    }"
prompt_start = None
prompt_end = None
page_ctx_start = None
page_ctx_end = None
estimate_start = None
estimate_end = None

for i, line in enumerate(orig_lines):
    if '    private String buildSystemPrompt(' in line or '    String buildSystemPrompt(' in line:
        prompt_start = i
    if prompt_start is not None and prompt_end is None:
        # Track brace depth
        pass
    if '    private String describePageContext(' in line or '    String describePageContext(' in line:
        page_ctx_start = i
        if prompt_end is None:
            # End prompt method at previous method's closing brace
            pass
    if '    private int estimateMaxIterations(' in line or '    int estimateMaxIterations(' in line:
        estimate_start = i

# Use brace-depth tracking to find method boundaries
def find_method_end(lines, start_idx):
    depth = 0
    started = False
    for i in range(start_idx, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
                started = True
            elif ch == '}':
                depth -= 1
                if started and depth == 0:
                    return i
    return len(lines) - 1

if prompt_start is not None:
    prompt_end = find_method_end(orig_lines, prompt_start)
if page_ctx_start is not None:
    page_ctx_end = find_method_end(orig_lines, page_ctx_start)
if estimate_start is not None:
    estimate_end = find_method_end(orig_lines, estimate_start)

print(f"  buildSystemPrompt: lines {prompt_start+1}-{prompt_end+1}")
print(f"  describePageContext: lines {page_ctx_start+1}-{page_ctx_end+1}")
print(f"  estimateMaxIterations: lines {estimate_start+1}-{estimate_end+1}")

# Extract the method bodies
prompt_body = ''.join(orig_lines[prompt_start:prompt_end+1])
page_ctx_body = ''.join(orig_lines[page_ctx_start:page_ctx_end+1])
estimate_body = ''.join(orig_lines[estimate_start:estimate_end+1])

# Make methods package-visible (remove private)
prompt_body = prompt_body.replace('    private String buildSystemPrompt(', '    public String buildSystemPrompt(', 1)
page_ctx_body = page_ctx_body.replace('    private String describePageContext(', '    public String describePageContext(', 1)
estimate_body = estimate_body.replace('    private int estimateMaxIterations(', '    public int estimateMaxIterations(', 1)

# ═══════════════════════════════════════════════════════════
# 5) AiAgentPromptHelper.java — uses verbatim extracted methods
# ═══════════════════════════════════════════════════════════
with open(os.path.join(HELPER_DIR, "AiAgentPromptHelper.java"), "w") as f:
    f.write('''package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AiAgentPromptHelper {

    private static final int MAX_SYSTEM_PROMPT_CHARS = 12000;

    @Autowired private AiContextBuilderService aiContextBuilderService;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

''')
    f.write(estimate_body)
    f.write('\n\n')
    f.write(prompt_body)
    f.write('\n\n')
    f.write(page_ctx_body)
    f.write('\n}\n')

print("✅ AiAgentPromptHelper.java created")

# ═══════════════════════════════════════════════════════════
# 6) Rewrite AiAgentOrchestrator.java — delegates to helpers
# ═══════════════════════════════════════════════════════════

# Read original to extract executeAgent and executeAgentStreaming methods
exec_agent_start = None
exec_agent_streaming_start = None
consume_start = None
emit_sse_start = None

for i, line in enumerate(orig_lines):
    stripped = line.strip()
    if 'public Result<String> executeAgent(' in stripped or 'Result<String> executeAgent(' in stripped:
        exec_agent_start = i
    if 'public void executeAgentStreaming(' in stripped or 'void executeAgentStreaming(' in stripped:
        exec_agent_streaming_start = i
    if 'public String consumeLastCommandId(' in stripped or 'String consumeLastCommandId(' in stripped:
        consume_start = i
    if 'private void emitSse(' in stripped or 'void emitSse(' in stripped:
        emit_sse_start = i

exec_agent_end = find_method_end(orig_lines, exec_agent_start) if exec_agent_start else None
exec_streaming_end = find_method_end(orig_lines, exec_agent_streaming_start) if exec_agent_streaming_start else None
consume_end = find_method_end(orig_lines, consume_start) if consume_start else None
emit_sse_end = find_method_end(orig_lines, emit_sse_start) if emit_sse_start else None

print(f"  executeAgent: lines {exec_agent_start+1}-{exec_agent_end+1}")
print(f"  executeAgentStreaming: lines {exec_agent_streaming_start+1}-{exec_streaming_end+1}")
print(f"  consumeLastCommandId: lines {consume_start+1}-{consume_end+1}")
print(f"  emitSse: lines {emit_sse_start+1}-{emit_sse_end+1}")

# Extract methods — keep private→private/public as-is, fix references to use helpers
exec_agent_body = ''.join(orig_lines[exec_agent_start:exec_agent_end+1])
exec_streaming_body = ''.join(orig_lines[exec_agent_streaming_start:exec_streaming_end+1])
consume_body = ''.join(orig_lines[consume_start:consume_end+1])
emit_sse_body = ''.join(orig_lines[emit_sse_start:emit_sse_end+1])

# Replace method calls in exec_agent_body and exec_streaming_body with helper delegates
def replace_refs(code):
    code = code.replace('executeToolsConcurrently(', 'toolExecHelper.executeToolsConcurrently(')
    code = code.replace('buildStuckSignature(', 'toolExecHelper.buildStuckSignature(')
    code = code.replace('isStuck(', 'toolExecHelper.isStuck(')
    code = code.replace('buildSystemPrompt(', 'promptHelper.buildSystemPrompt(')
    code = code.replace('compactConversationHistory(', 'memoryHelper.compactConversationHistory(')
    code = code.replace('getConversationHistory(', 'memoryHelper.getConversationHistory(')
    code = code.replace('saveConversationTurn(', 'memoryHelper.saveConversationTurn(')
    code = code.replace('enhanceMemoryAsync(', 'memoryHelper.enhanceMemoryAsync(')
    code = code.replace('captureTeamDispatchCard(', 'evidenceHelper.captureTeamDispatchCard(')
    code = code.replace('appendTeamDispatchCards(', 'evidenceHelper.appendTeamDispatchCards(')
    code = code.replace('captureBundleSplitCard(', 'evidenceHelper.captureBundleSplitCard(')
    code = code.replace('appendBundleSplitCards(', 'evidenceHelper.appendBundleSplitCards(')
    code = code.replace('toToolLookup(', 'toolExecHelper.toToolLookup(')
    code = code.replace('buildUnavailableToolResult(', 'toolExecHelper.buildUnavailableToolResult(')
    code = code.replace('estimateMaxIterations(', 'promptHelper.estimateMaxIterations(')
    code = code.replace('buildToolEvidenceMessage(', 'evidenceHelper.buildToolEvidenceMessage(')
    # Fix double-delegation (helper.helper.xxx)
    code = code.replace('toolExecHelper.toolExecHelper.', 'toolExecHelper.')
    code = code.replace('promptHelper.promptHelper.', 'promptHelper.')
    code = code.replace('memoryHelper.memoryHelper.', 'memoryHelper.')
    code = code.replace('evidenceHelper.evidenceHelper.', 'evidenceHelper.')
    # Fix: ToolExecRecord comes from helper now
    return code

exec_agent_body = replace_refs(exec_agent_body)
exec_streaming_body = replace_refs(exec_streaming_body)

# Also need to replace ToolExecRecord references
exec_agent_body = exec_agent_body.replace('ToolExecRecord', 'AiAgentToolExecHelper.ToolExecRecord')
exec_streaming_body = exec_streaming_body.replace('ToolExecRecord', 'AiAgentToolExecHelper.ToolExecRecord')

# Fix: resolveVisibleTools should use toolExecHelper.getToolMap()
exec_agent_body = exec_agent_body.replace('resolveVisibleTools(toolMap,', 'resolveVisibleTools(toolExecHelper.getToolMap(),')
exec_streaming_body = exec_streaming_body.replace('resolveVisibleTools(toolMap,', 'resolveVisibleTools(toolExecHelper.getToolMap(),')

# Find resolveVisibleTools method and saveCurrentConversationToMemory
resolve_start = None
save_conv_start = None
for i, line in enumerate(orig_lines):
    if 'resolveVisibleTools(' in line and ('private' in line or 'List<AgentTool>' in line) and 'Map<String' in line:
        resolve_start = i
    if 'public void saveCurrentConversationToMemory(' in line:
        save_conv_start = i

# Check if resolveVisibleTools exists
if resolve_start is not None:
    resolve_end = find_method_end(orig_lines, resolve_start)
    resolve_body = ''.join(orig_lines[resolve_start:resolve_end+1])
    print(f"  resolveVisibleTools: lines {resolve_start+1}-{resolve_end+1}")
else:
    resolve_body = ''
    # It's probably in AiAgentToolAccessService - check the callers
    print("  resolveVisibleTools: NOT FOUND in file (may be in another class)")

# Write the new orchestrator
with open(orig_path, "w") as f:
    f.write('''package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentEvidenceHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired private AiCriticOrchestrator criticOrchestrator;
    @Autowired private XiaoyunInsightCardOrchestrator xiaoyunInsightCardOrchestrator;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;

    @Autowired private AiAgentPromptHelper promptHelper;
    @Autowired private AiAgentToolExecHelper toolExecHelper;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiAgentMemoryHelper memoryHelper;

    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();

''')
    f.write(exec_agent_body)
    f.write('\n\n')
    f.write(consume_body)
    f.write('\n\n')
    f.write(exec_streaming_body)
    f.write('\n\n')
    # saveCurrentConversationToMemory - rewrite to delegate
    f.write('''    public void saveCurrentConversationToMemory() {
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        memoryHelper.saveCurrentConversationToMemory(userId, tenantId);
    }

''')
    f.write(emit_sse_body)
    f.write('\n}\n')

print("✅ AiAgentOrchestrator.java rewritten")

# Count lines
for fname in ["AiAgentMemoryHelper.java", "AiAgentEvidenceHelper.java", "AiAgentToolExecHelper.java", "AiAgentPromptHelper.java"]:
    fpath = os.path.join(HELPER_DIR, fname)
    if os.path.exists(fpath):
        with open(fpath) as ff:
            cnt = sum(1 for _ in ff)
        print(f"  {fname}: {cnt} lines")

with open(orig_path) as ff:
    cnt = sum(1 for _ in ff)
print(f"  AiAgentOrchestrator.java: {cnt} lines")

print("\n🎉 Split complete! Run mvn compile to verify.")
