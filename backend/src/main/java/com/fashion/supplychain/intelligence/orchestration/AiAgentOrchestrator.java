package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.hook.ToolExecutionHook;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired
    private AiCriticOrchestrator criticOrchestrator;

    @Autowired
    private XiaoyunInsightCardOrchestrator xiaoyunInsightCardOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();
    /** F11: 工具原始输出截断阈值（从 1800 提升到 3000，避免复杂查询被过度截断） */
    private static final int MAX_TOOL_RAW_CHARS = 3000;
    /** F8: 系统提示词最大字符数（超出截断以防溢出 context window） */
    private static final int MAX_SYSTEM_PROMPT_CHARS = 12000;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private List<AgentTool> registeredTools;

    @Autowired
    private AiContextBuilderService aiContextBuilderService;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    @Autowired
    private AiMemoryOrchestrator aiMemoryOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    @Autowired
    private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;

    @Autowired(required = false)
    private List<ToolExecutionHook> toolHooks;

    private Map<String, AgentTool> toolMap;

    /** 对话记忆：userId → 最近 N 轮 user+assistant 消息（LRU 淘汰最久未访问的用户） */
    private final Map<String, List<AiMessage>> conversationMemory = Collections.synchronizedMap(
            new LinkedHashMap<String, List<AiMessage>>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, List<AiMessage>> eldest) {
                    return size() > MAX_USERS_CACHED;
                }
            });
    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();
    private static final int MAX_MEMORY_TURNS = 6; // 保留最近6轮（12条消息）
    private static final int MAX_USERS_CACHED = 200; // 超过则清理最早的
    /** 会话历史压缩阈值：超过此轮数时触发 LLM 摘要压缩（保留最近2轮原文，其余压缩） */
    private static final int COMPACT_THRESHOLD_TURNS = 8;
    /** Stuck 检测：同一工具+参数连续调用超过此次数时强制跳出 */
    private static final int STUCK_MAX_REPEAT = 3;
    /** F17: 命名线程池（有界队列、名称可述、CallerRuns 拒绝策略） */
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

    /** F17: 优雅关闭工具线程池，等待进行中的任务完成 */
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

    /**
     * 根据用户消息复杂度自适应调整最大迭代轮次。
     * 简单问候→2轮；普通查询→8轮；多维分析→10轮；操作型任务→12轮。
     */
    private int estimateMaxIterations(String userMessage) {
        if (userMessage == null || userMessage.length() < 8) return 3;
        String msg = userMessage.trim();
        if (msg.length() < 25 && msg.matches("(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗).*")) {
            return 2;
        }
        // 操作型任务：需要查询+执行，轮次最多（最高优先级）
        if (msg.matches("(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) {
            return 12;
        }
        // 多维分析 / 复杂调查（含"什么问题/什么情况/看一下"等口语化问法）
        if (msg.matches("(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*")) {
            return 10;
        }
        return 8;
    }

    public Result<String> executeAgent(String userMessage) {
        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        String commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
        lastCommandIdHolder.set(commandId);
        try { // F31: finally 块强制清理 ThreadLocal，防止线程池复用泄漏
        long requestStartAt = System.currentTimeMillis();
        String userId = UserContext.userId();
        List<AgentTool> visibleTools = aiAgentToolAccessService.resolveVisibleTools(registeredTools);
        Map<String, AgentTool> visibleToolMap = toToolLookup(visibleTools);
        List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);
        List<AiMessage> messages = new ArrayList<>();
        List<JsonNode> teamDispatchCards = new ArrayList<>();
        List<JsonNode> bundleSplitCards = new ArrayList<>();
        List<JsonNode> xiaoyunInsightCards = new ArrayList<>();
        messages.add(AiMessage.system(buildSystemPrompt(userMessage, visibleTools)));
        // 加载对话记忆（最近 N 轮），超过阈值时自动 LLM 压缩
        List<AiMessage> history = getConversationHistory(userId);
        messages.addAll(compactConversationHistory(history));
        messages.add(AiMessage.user(userMessage));

        int maxIterations = estimateMaxIterations(userMessage);
        int currentIter = 0;
        List<String> stuckSignatures = new ArrayList<>(); // Stuck 检测：跨轮次工具调用签名

        while (currentIter < maxIterations) {
            currentIter++;
            log.info("[AiAgent] 开始第 {} 轮思考...", currentIter);

            // 进度感知：让 LLM 知道当前轮次，避免无效循环
            if (currentIter > 2) {
                messages.add(AiMessage.system(String.format(
                    "[进度提示] 当前第%d/%d轮。如已有足够信息请直接给出最终回答，避免重复调用工具。", currentIter, maxIterations)));
            }

            IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, visibleApiTools);
            if (!result.isSuccess()) {
                log.error("[AiAgent] 推理失败: {}", result.getErrorMessage());
                aiAgentTraceOrchestrator.finishRequest(commandId, null, result.getErrorMessage(), System.currentTimeMillis() - requestStartAt);
                return Result.fail("推理服务暂时不可用: " + result.getErrorMessage());
            }

            // LLM Response
            AiMessage assistantMessage = AiMessage.assistant(result.getContent());

            // Handle Tool Calls
            if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                // ── Stuck 检测：连续相同工具+参数调用超过阈值则强制终止 ──
                Set<String> iterSignatures = new HashSet<>();
                for (AiToolCall tc : result.getToolCalls()) {
                    iterSignatures.add(buildStuckSignature(tc));
                }
                stuckSignatures.addAll(iterSignatures);
                if (isStuck(stuckSignatures)) {
                    log.warn("[AiAgent] Stuck 检测触发：连续 {} 轮重复相同工具调用，强制终止", STUCK_MAX_REPEAT);
                    String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
                    aiAgentTraceOrchestrator.finishRequest(commandId, stuckMsg, "stuck_detected", System.currentTimeMillis() - requestStartAt);
                    return Result.success(stuckMsg);
                }

                assistantMessage.setTool_calls(result.getToolCalls());
                messages.add(assistantMessage);

                // ── 并发执行多工具调用 + Pre/Post Hooks ──
                List<ToolExecRecord> execRecords = executeToolsConcurrently(result.getToolCalls(), visibleToolMap, commandId);
                for (ToolExecRecord rec : execRecords) {
                    captureTeamDispatchCard(rec.toolName, rec.rawResult, teamDispatchCards);
                    captureBundleSplitCard(rec.toolName, rec.rawResult, bundleSplitCards);
                    xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, xiaoyunInsightCards);
                    messages.add(AiMessage.tool(rec.evidence, rec.toolCallId, rec.toolName));
                }
            } else {
                // Done!
                log.info("[AiAgent] 完成任务，进入自反思审查层");
                String revisedContent = criticOrchestrator.reviewAndRevise(userMessage, result.getContent());
                revisedContent = appendTeamDispatchCards(revisedContent, teamDispatchCards);
                revisedContent = appendBundleSplitCards(revisedContent, bundleSplitCards);
                revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, xiaoyunInsightCards);

                log.info("[AiAgent] 返回最终结果给用户");
                saveConversationTurn(userId, userMessage, revisedContent);
                aiAgentTraceOrchestrator.finishRequest(commandId, revisedContent, null, System.currentTimeMillis() - requestStartAt);
                // ── 租户级 AI 记忆增强：异步提取对话洞察 ──
                enhanceMemoryAsync(userId, userMessage, revisedContent);
                return Result.success(revisedContent);
            }
        }

        aiAgentTraceOrchestrator.finishRequest(commandId, null, "对话轮数超过限制", System.currentTimeMillis() - requestStartAt);
        return Result.fail("对话轮数超过限制 (" + maxIterations + ")，可能陷入了死循环。");
        } finally { // F31: 强制清理 ThreadLocal
            lastCommandIdHolder.remove();
        }
    }

    public String consumeLastCommandId() {
        String commandId = lastCommandIdHolder.get();
        lastCommandIdHolder.remove();
        return commandId;
    }

    /**
     * SSE 流式执行 Agent：每一轮思考/工具调用/最终回答都通过 SseEmitter 推送给前端。
     * 事件类型：thinking | tool_call | tool_result | answer | error | done
     *
     * <p><b>架构备注(F7)</b>：本方法与 executeAgent() 共享约 70% 的 ReAct 循环逻辑，
     * 差异在于输出机制(return vs SSE)和错误处理(Result vs emitter.complete)。
     * 后续可提取公共的 ReAct 循环骨架方法，通过回调接口区分输出通道，消除重复。</p>
     */
    public void executeAgentStreaming(String userMessage, SseEmitter emitter) {
        String commandId = null;
        long requestStartAt = System.currentTimeMillis();
        try {
            if (!inferenceOrchestrator.isAnyModelEnabled()) {
                emitSse(emitter, "error", Map.of("message", "智能服务暂未配置或不可用"));
                emitter.complete();
                return;
            }

            commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
            List<AgentTool> visibleTools = aiAgentToolAccessService.resolveVisibleTools(registeredTools);
            Map<String, AgentTool> visibleToolMap = toToolLookup(visibleTools);
            List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);
            List<AiMessage> messages = new ArrayList<>();
            List<JsonNode> teamDispatchCards = new ArrayList<>();
            List<JsonNode> bundleSplitCards = new ArrayList<>();
            List<JsonNode> xiaoyunInsightCards = new ArrayList<>();
            messages.add(AiMessage.system(buildSystemPrompt(userMessage, visibleTools)));
            String userId = UserContext.userId();
            List<AiMessage> history = getConversationHistory(userId);
            messages.addAll(compactConversationHistory(history));
            messages.add(AiMessage.user(userMessage));

            int maxIterations = estimateMaxIterations(userMessage);
            List<String> stuckSignatures = new ArrayList<>(); // Stuck 检测
            for (int i = 1; i <= maxIterations; i++) {
                emitSse(emitter, "thinking", Map.of("iteration", i, "message", "正在思考第 " + i + " 轮…"));

                // 进度感知：让 LLM 知道当前轮次，避免无效循环
                if (i > 2) {
                    messages.add(AiMessage.system(String.format(
                        "[进度提示] 当前第%d/%d轮。如已有足够信息请直接给出最终回答，避免重复调用工具。", i, maxIterations)));
                }

                IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, visibleApiTools);
                if (!result.isSuccess()) {
                    aiAgentTraceOrchestrator.finishRequest(commandId, null, result.getErrorMessage(), System.currentTimeMillis() - requestStartAt);
                    emitSse(emitter, "error", Map.of("message", "推理服务暂时不可用: " + result.getErrorMessage()));
                    emitter.complete();
                    return;
                }

                AiMessage assistantMessage = AiMessage.assistant(result.getContent());

                if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                    // ── Stuck 检测 ──
                    Set<String> iterSigs = new HashSet<>();
                    for (AiToolCall tc : result.getToolCalls()) {
                        iterSigs.add(buildStuckSignature(tc));
                    }
                    stuckSignatures.addAll(iterSigs);
                    if (isStuck(stuckSignatures)) {
                        log.warn("[AiAgent-Stream] Stuck 检测触发，强制终止");
                        String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
                        aiAgentTraceOrchestrator.finishRequest(commandId, stuckMsg, "stuck_detected", System.currentTimeMillis() - requestStartAt);
                        emitSse(emitter, "answer", Map.of("content", stuckMsg, "commandId", commandId));
                        emitSse(emitter, "done", Map.of());
                        emitter.complete();
                        return;
                    }

                    assistantMessage.setTool_calls(result.getToolCalls());
                    messages.add(assistantMessage);

                    // ── 并发执行多工具调用 + Pre/Post Hooks ──
                    // 先发送所有 tool_call 事件
                    for (AiToolCall toolCall : result.getToolCalls()) {
                        emitSse(emitter, "tool_call", Map.of("tool", toolCall.getFunction().getName(), "arguments", toolCall.getFunction().getArguments()));
                    }
                    List<ToolExecRecord> execRecords = executeToolsConcurrently(result.getToolCalls(), visibleToolMap, commandId);
                    for (ToolExecRecord rec : execRecords) {
                        captureTeamDispatchCard(rec.toolName, rec.rawResult, teamDispatchCards);
                        captureBundleSplitCard(rec.toolName, rec.rawResult, bundleSplitCards);
                        xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, xiaoyunInsightCards);
                        emitSse(emitter, "tool_result", Map.of(
                                "tool", rec.toolName,
                                "success", !rec.rawResult.contains("\"error\""),
                                "summary", truncateOneLine(rec.evidence, 200)));
                        messages.add(AiMessage.tool(rec.evidence, rec.toolCallId, rec.toolName));
                    }
                } else {
                    // == 自反思审查 ==
                    emitSse(emitter, "thinking", Map.of("message", "小云正在进行最终思考核对与完善..."));
                    String revisedContent = criticOrchestrator.reviewAndRevise(userMessage, result.getContent());
                    revisedContent = appendTeamDispatchCards(revisedContent, teamDispatchCards);
                    revisedContent = appendBundleSplitCards(revisedContent, bundleSplitCards);
                    revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, xiaoyunInsightCards);

                    // 最终回答
                    saveConversationTurn(userId, userMessage, revisedContent);
                    aiAgentTraceOrchestrator.finishRequest(commandId, revisedContent, null, System.currentTimeMillis() - requestStartAt);
                    // ── 租户级 AI 记忆增强：异步提取对话洞察 ──
                    enhanceMemoryAsync(userId, userMessage, revisedContent);
                    emitSse(emitter, "answer", Map.of("content", revisedContent, "commandId", commandId));
                    emitSse(emitter, "done", Map.of());
                    emitter.complete();
                    return;
                }
            }

            aiAgentTraceOrchestrator.finishRequest(commandId, null, "对话轮数超过限制", System.currentTimeMillis() - requestStartAt);
            emitSse(emitter, "error", Map.of("message", "对话轮数超过限制"));
            emitter.complete();

        } catch (Exception e) {
            log.error("[AiAgent-Stream] 流式执行异常", e);
            if (commandId != null) {
                aiAgentTraceOrchestrator.finishRequest(commandId, null, e.getMessage(), System.currentTimeMillis() - requestStartAt);
            }
            try {
                emitSse(emitter, "error", Map.of("message", "系统异常: " + e.getMessage()));
                emitter.complete();
            } catch (Exception ignored) {
                emitter.completeWithError(e);
            }
        }
    }

    // ── 对话记忆管理 ──

    private List<AiMessage> getConversationHistory(String userId) {
        if (userId == null || userId.isBlank()) return List.of();
        List<AiMessage> history = conversationMemory.get(userId);
        if (history == null || history.isEmpty()) return List.of();
        synchronized (history) {
            return new ArrayList<>(history);
        }
    }

    private void saveConversationTurn(String userId, String userMsg, String assistantMsg) {
        if (userId == null || userId.isBlank()) return;
        // LRU 淘汰由 LinkedHashMap.removeEldestEntry 自动处理
        List<AiMessage> history = conversationMemory.computeIfAbsent(userId, k -> new ArrayList<>());
        synchronized (history) {
            history.add(AiMessage.user(userMsg));
            history.add(AiMessage.assistant(assistantMsg));
            // 保留最近 MAX_MEMORY_TURNS 轮（每轮2条）
            int maxMessages = MAX_MEMORY_TURNS * 2;
            while (history.size() > maxMessages) {
                history.remove(0);
            }
        }
    }

    private String buildSystemPrompt(String userMessage, List<AgentTool> visibleTools) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        boolean isManager = aiAgentToolAccessService.hasManagerAccess();
        String intelligenceContext;
        try {
            intelligenceContext = aiContextBuilderService.buildSystemPrompt();
        } catch (Exception e) {
            log.warn("[AiAgent] 构建实时智能上下文失败: {}", e.getMessage());
            intelligenceContext = "【实时经营上下文】暂时获取失败，请优先通过工具查询后再下结论。\n";
        }

        String contextBlock = "【当前环境】\n" +
                "- 当前时间：" + currentTime + "\n" +
                "- 今日日期：" + currentDate + "\n" +
                "- 当前用户：" + (userName != null ? userName : "未知") + "\n" +
                "- 用户角色：" + (userRole != null ? userRole : "普通用户") +
                (isSuperAdmin ? "（超级管理员）" : isTenantOwner ? "（租户老板）" : isManager ? "（管理人员）" : "（生产员工）") + "\n";

        // 普通生产员工的访问限制提示
        String workerRestriction = "";
        if (!isManager) {
            workerRestriction = "\n【⚠️ 权限说明】\n" +
                    "当前用户是生产员工，仅允许查询与自己相关的生产信息。\n" +
                    "可以回答：本人负责订单的进度、相关扫码记录、当前生产任务状态、系统操作与SOP说明、本人计件工资明细。\n" +
                    "禁止回答：全厂汇总数据、财务结算总览、他人工资数据、管理层报告、仓库/CRM/采购等管理功能。\n" +
                    "当用户询问超出权限范围的问题时，友好说明：该信息需管理员权限，同时引导用户可以查什么。\n";
        }

        // ── 历史对话记忆注入 ──
        String memoryContext = "";
        try {
            memoryContext = aiMemoryOrchestrator.getMemoryContext(
                    UserContext.tenantId(), UserContext.userId());
        } catch (Exception e) {
            log.debug("[AiAgent] 加载历史对话记忆失败，跳过: {}", e.getMessage());
        }

        // ── 混合检索 RAG — 相关历史经验（语义 + 关键词 + 热度）──
        String ragContext = "";
        try {
            if (userMessage != null && !userMessage.isBlank()) {
                Long ragTenantId = UserContext.tenantId();
                IntelligenceMemoryResponse ragResult =
                        intelligenceMemoryOrchestrator.recallSimilar(ragTenantId, userMessage, 3);
                List<IntelligenceMemoryResponse.MemoryItem> recalled = ragResult.getRecalled();
                if (recalled != null && !recalled.isEmpty()) {
                    List<IntelligenceMemoryResponse.MemoryItem> relevant = recalled.stream()
                            .filter(item -> item.getSimilarityScore() >= 0.45f)
                            .collect(Collectors.toList());
                    if (!relevant.isEmpty()) {
                        StringBuilder rag = new StringBuilder();
                        rag.append("【混合检索 RAG — 相关历史经验参考（融合分≥0.45）】\n");
                        for (int ri = 0; ri < relevant.size(); ri++) {
                            IntelligenceMemoryResponse.MemoryItem item = relevant.get(ri);
                            String c = item.getContent();
                            if (c != null && c.length() > 150) c = c.substring(0, 150) + "…";
                            rag.append(String.format("  %d. [%s/%s] %s（融合分%.2f，采纳%d次）\n     %s\n",
                                    ri + 1,
                                    item.getMemoryType() != null ? item.getMemoryType() : "case",
                                    item.getBusinessDomain() != null ? item.getBusinessDomain() : "general",
                                    item.getTitle() != null ? item.getTitle() : "",
                                    item.getSimilarityScore(),
                                    item.getAdoptedCount(),
                                    c != null ? c : ""));
                        }
                        rag.append("（以上为历史经验参考，判断须以工具查询的实时数据为准）\n\n");
                        ragContext = rag.toString();
                        log.debug("[AiAgent-RAG] 本次问题混合检索到 {} 条相关经验", relevant.size());
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[AiAgent-RAG] 混合检索跳过（Qdrant 未启用或记忆链失败）: {}", e.getMessage());
        }

        String toolGuide = aiAgentToolAccessService.buildToolGuide(visibleTools);

        String prompt = "你是小云——服装供应链智能运营助理。第一句必须给结论+关键数字，不铺垫背景，不捏造数据。\n\n" +
                contextBlock + "\n" +
                workerRestriction +
                intelligenceContext + "\n" +
                memoryContext +
                ragContext +
                toolGuide +
                "【协作原则 — 必须遵守】\n" +
                "1. 先判断，再解释，再给动作。不要先铺垫背景。第一句必须给出当前最关键的判断。\n" +
                "2. 你的每个判断都要能落回真实数据、真实对象、真实风险，不允许用空泛词代替结论。\n" +
                "3. 用户问“怎么办”时，必须给负责人、动作、优先级和预期结果，不要只给概念建议。\n" +
                "4. 用户问“帮我处理”时，如果语义明确且风险可控，直接进入执行流程；如果涉及真实写操作且对象不清晰，用一句话确认关键对象后执行。\n" +
                "5. 发现数据不足时要明确说缺什么，再优先调用工具补足，不要编。\n" +
                "6. 发现多个问题时，按影响交期、影响现金、影响客户、影响产能的顺序排序。\n" +
                "7. 你不是客服口吻。语气要像一个成熟的业务搭档，直接、克制、可信。\n\n" +
                "【工具使用策略 — 必须遵守】\n" +
                "1. 只能使用【当前会话可用工具】里已经列出的工具；没列出的能力一律视为当前账号不可用。\n" +
                "2. 概览类问题先查总览，单订单/单对象问题先查明细，规则/SOP问题先查知识库。\n" +
                "3. 同一结论需要多个维度时，先查主事实，再补风险、库存、财务，不要无序乱调工具。\n" +
                "4. 写操作对象明确且风险可控就直接执行；对象不明确时，只补一句最关键的确认，不要反复追问。\n" +
                "5. 工具返回权限不足或数据不足时，要直接说明限制，并给出当前账号还能继续查的内容。\n" +
                "6. 当用户问“现在最应该关注什么”时，优先使用带优先级、风险排序或异常聚合能力的工具。\n" +
                "7. 当用户问“怎么办”时，优先把建议落到负责人、动作、时效和预期结果。\n\n" +                "【主动思考指引 — tool_think 使用时机】\n" +
                "遇到以下任一情况，请务必先调用 tool_think 理清思路，再进行后续工具调用或输出建议：\n" +
                "1. 问题涉及 3 个以上数据维度（如 订单 + 工厂 + 时间 + 财务 的复合查询）；\n" +
                "2. 需要规划 3 个及以上工具的调用顺序；\n" +
                "3. 需要做风险判断、进度推算、成本估算或异常分析；\n" +
                "4. 用户给出模糊指令（\u201c帮我分析\u201d\u201c最应该关注什么\u201d\u201c怎么处理\u201d等），需要先拆解理解；\n" +
                "5. 工具返回结果与预期不符，需要重新推理后再调用其他工具。\n" +
                "tool_think 无任何副作用，执行成本极低；先思考再行动比直接猜测工具调用准确率更高。\n\n" +
                "【输出要求】\n" +
                "- 默认用这个顺序组织回答：结论 → 依据 → 动作。需要时再补风险或预期效果。\n" +
                "- 结论必须短，依据必须有数字或对象，动作最多 3 条。\n" +
                "- 善用对比：环比、剩余天数、进度差、工厂横向差异。\n" +
                "- 风险表达统一使用：🔴紧急、🟠高、🟡中、🟢稳定。\n" +
                "- \u8bed\u6c14\u8981\u6709\u6e29\u5ea6\u3001\u6709\u70b9\u5446\u840c\u53ef\u7231\uff0c\u53e3\u8bed\u5316\u5bf9\u8bdd\u65f6\u672b\u5c3e\u53ef\u9002\u5f53\u5e26\u300c\u54e6\u300d\u300c\u5440\u300d\u300c\u5462\u300d\u300c\u554a\u300d\u7b49\u81ea\u7136\u8bed\u6c14\u8bcd\uff0c\u8ba9\u4eba\u611f\u89c9\u4eb2\u5207\u4e0d\u751f\u786c\u3002\u4f46\u62a5\u544a/\u6570\u5b57/\u5efa\u8bae\u90e8\u5206\u4f9d\u7136\u4e13\u4e1a\u76f4\u63a5\uff0c\u4e0d\u8981\u7528\u8bed\u6c14\u8bcd\u5806\u7802\u3002\n" +
                "- emoji \u9002\u91cf\u4f7f\u7528\uff08\u5bf9\u8bdd\u6bcf\u6761 \u2264 2 \u4e2a\uff09\uff0c\u4f18\u5148\u7528\uff1a\ud83d\ude0a\u2728\ud83d\udc40\ud83d\udca1\ud83d\udce6\uff0c\u907f\u514d\u7b26\u53f7\u5806\u7802\u4e71\u6b63\u6587\u3002\n" +
                "- \u62a5\u544a\u548c\u5206\u6790\u8981\u50cf\u771f\u5b9e\u7ecf\u8425\u4f1a\u8bae\u6750\u6599\uff1b\u65e5\u5e38\u5bf9\u8bdd\u53ef\u4ee5\u6d3b\u6cfc\u4e00\u70b9\uff0c\u7ed3\u8bba\u548c\u6570\u5b57\u90e8\u5206\u4e0d\u542b\u7cca\u3002\n" +
                "- \u6570\u636e\u9a71\u52a8\uff1a\u6bcf\u4e2a\u5224\u65ad\u90fd\u8981\u6709\u5177\u4f53\u6570\u5b57\u652f\u6491\uff0c\u7edd\u4e0d\u6367\u9020\u6570\u636e\u3002\n\n" +
                "【执行操作准则】\n" +
                "- 你现在是具备真实操作能力的智能体，不要推脱，用户指令明确时直接执行，执行后汇报结果。\n" +
                "- 当用户要求“找人处理”“通知某岗位”“安排谁跟进”时，不要只给建议，优先直接完成派单，并说明已通知的对象、时效和下一步。\n\n" +
                "- 面辅料审核、物料对账、财务审批、样衣开发这些都属于真实业务流程。只要用户对象明确，优先直接执行工具，不要退化成流程讲解。\n\n" +
                "【强制格式】\n" +
                "回答末尾必须换行并推荐 3 个相关追问，格式：\n" +
                "【推荐追问】：问题1 | 问题2 | 问题3\n\n" +
                "【富媒体输出 — 仅在有真实数据时选填，置于推荐追问之前】\n" +
                "A) 若回答中含有可视化数据（排名/趋势/分布/占比/进度），插入图表：\n" +
                "【CHART】{\"type\":\"bar\",\"title\":\"工厂在制订单量\",\"xAxis\":[\"工厂A\",\"工厂B\"],\"series\":[{\"name\":\"订单数\",\"data\":[12,8]}],\"colors\":[\"#1890ff\"]}【/CHART】\n" +
                "type: bar(柱状)/line(折线)/pie(饼图)/progress(单进度条)\n" +
                "pie格式: {\"type\":\"pie\",\"title\":\"xxx\",\"series\":[{\"name\":\"A\",\"value\":30}]}\n" +
                "progress格式: {\"type\":\"progress\",\"title\":\"整体完成率\",\"value\":67}\n" +
                "B) 若回答中含有可立即执行的操作且有真实订单号，插入操作卡片：\n" +
                "【ACTIONS】[{\"title\":\"标题\",\"desc\":\"描述\",\"orderId\":\"真实ID\",\"actions\":[{\"label\":\"标记紧急\",\"type\":\"mark_urgent\"},{\"label\":\"查看详情\",\"type\":\"navigate\",\"path\":\"/production/orders\"}]}]【/ACTIONS】\n" +
                "action type: mark_urgent/remove_urgent/navigate/send_notification/urge_order\n" +
                "C) 用户要求催单/跟进出货/催出货日期时，为每个相关订单生成催单卡片（type=urge_order）：\n" +
                "【ACTIONS】[{\"title\":\"催单通知\",\"desc\":\"请尽快填写最新预计出货日期并备注情况\",\"orderNo\":\"真实单号\",\"responsiblePerson\":\"订单跟单员或工厂老板姓名\",\"factoryName\":\"工厂名\",\"currentExpectedShipDate\":\"当前预计出货日期(如有,格式YYYY-MM-DD)\",\"actions\":[{\"label\":\"填写出货日期\",\"type\":\"urge_order\"}]}]【/ACTIONS】\n" +
                "⚠️ 仅用真实数据，禁止用占位符。常规闲聊不生成这两个标记块。订单号必须是数据库中真实存在的。";
        if (prompt.length() > MAX_SYSTEM_PROMPT_CHARS) {
            log.warn("[AiAgent] systemPrompt过长({}字符)，截断至{}", prompt.length(), MAX_SYSTEM_PROMPT_CHARS);
            prompt = prompt.substring(0, MAX_SYSTEM_PROMPT_CHARS) + "\n...(系统提示词已截断，请用工具查询补充信息)";
        }
        return prompt;
    }

    /** 将当前用户的会话记忆异步持久化（由 Controller 在会话结束时调用） */
    public void saveCurrentConversationToMemory() {
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        List<AiMessage> msgs = getConversationHistory(userId);
        aiMemoryOrchestrator.saveConversation(tenantId, userId, msgs);
    }

    private Map<String, AgentTool> toToolLookup(List<AgentTool> visibleTools) {
        return visibleTools.stream().collect(Collectors.toMap(AgentTool::getName, tool -> tool));
    }

    private String buildUnavailableToolResult(String toolName) {
        if (toolMap.containsKey(toolName) && !aiAgentToolAccessService.canUseTool(toolName)) {
            return "{\"error\": \"当前账号无权使用工具: " + toolName + "\"}";
        }
        return "{\"error\": \"工具不存在: " + toolName + "\"}";
    }

    private void emitSse(SseEmitter emitter, String eventName, Map<String, Object> data) {
        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(JSON.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }

    private String buildToolEvidenceMessage(String toolName, String toolResult) {
        String safeResult = toolResult == null ? "" : toolResult.trim();
        if (safeResult.isEmpty()) {
            return "【工具证据】\n- 工具: " + toolName + "\n- 状态: 空结果\n- 原始结果: （空）";
        }
        try {
            JsonNode root = JSON.readTree(safeResult);
            if (root.hasNonNull("error")) {
                return "【工具证据】\n- 工具: " + toolName + "\n- 状态: 失败\n- 错误: "
                        + root.path("error").asText() + "\n- 原始结果: " + truncate(safeResult, 400);
            }

            StringBuilder evidence = new StringBuilder();
            evidence.append("【工具证据】\n")
                    .append("- 工具: ").append(toolName).append("\n")
                    .append("- 状态: 成功\n");

            if ("tool_knowledge_search".equals(toolName)) {
                appendKnowledgeEvidence(evidence, root);
            } else if ("tool_whatif".equals(toolName)) {
                appendWhatIfEvidence(evidence, root);
            } else if ("tool_multi_agent".equals(toolName)) {
                appendMultiAgentEvidence(evidence, root);
            } else {
                appendGenericEvidence(evidence, root);
            }

            int rawExcerptLimit = resolveRawExcerptLimit(toolName);
            if (rawExcerptLimit > 0) {
                evidence.append("- 原始结果摘录: ").append(truncate(safeResult, rawExcerptLimit));
            }
            return evidence.toString();
        } catch (Exception e) {
            return "【工具证据】\n- 工具: " + toolName + "\n- 状态: 成功\n- 结构化解析: 失败，回退原始文本\n- 原始结果: "
                    + truncate(safeResult, MAX_TOOL_RAW_CHARS);
        }
    }

    private void appendKnowledgeEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 检索模式: ").append(root.path("retrievalMode").asText("unknown")).append("\n")
                .append("- 命中统计: 结果").append(root.path("count").asInt(0))
                .append("条，语义召回").append(root.path("semanticHits").asInt(0))
                .append("条，关键词召回").append(root.path("keywordHits").asInt(0)).append("条\n");
        JsonNode items = root.path("items");
        if (items.isArray() && items.size() > 0) {
            for (int i = 0; i < Math.min(items.size(), 3); i++) {
                JsonNode item = items.get(i);
                evidence.append("- 证据").append(i + 1).append(": ")
                        .append(item.path("title").asText("未命名"))
                        .append(" [").append(item.path("category").asText("general")).append("]")
                        .append(" 融合分").append(String.format("%.2f", item.path("hybridScore").asDouble(0d)))
                        .append("，语义分").append(String.format("%.2f", item.path("semanticScore").asDouble(0d)))
                        .append("，关键词分").append(String.format("%.2f", item.path("keywordScore").asDouble(0d)))
                        .append("，摘要: ").append(truncate(item.path("content").asText(""), 90))
                        .append("\n");
            }
        }
    }

    private void appendWhatIfEvidence(StringBuilder evidence, JsonNode root) {
        if (root.hasNonNull("summary")) {
            evidence.append("- 推演摘要: ").append(root.path("summary").asText()).append("\n");
        }
        if (root.hasNonNull("recommended")) {
            evidence.append("- 推荐方案: ").append(root.path("recommended").asText()).append("\n");
        }
        JsonNode baseline = root.path("baseline");
        if (baseline != null && !baseline.isMissingNode() && !baseline.isNull()) {
            evidence.append("- 基线: ")
                    .append(baseline.path("desc").asText(baseline.path("key").asText("baseline")))
                    .append("，评分").append(String.format("%.0f", baseline.path("score").asDouble(0d)))
                    .append("\n");
        }
        JsonNode scenarios = root.path("scenarios");
        if (scenarios.isArray() && scenarios.size() > 0) {
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

    private void captureTeamDispatchCard(String toolName, String toolResult, List<JsonNode> teamDispatchCards) {
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

    private String appendTeamDispatchCards(String content, List<JsonNode> teamDispatchCards) {
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

    private void captureBundleSplitCard(String toolName, String toolResult, List<JsonNode> bundleSplitCards) {
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

    private String appendBundleSplitCards(String content, List<JsonNode> bundleSplitCards) {
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

    private String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    private String truncateOneLine(String text, int maxLength) {
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

    // ══════════════════════════════════════════════════════════
    // Upgrade #1  会话历史压缩 — 超过阈值轮数时 LLM 摘要压缩旧对话
    // ══════════════════════════════════════════════════════════

    private List<AiMessage> compactConversationHistory(List<AiMessage> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        // 每 2 条消息视为 1 轮（user + assistant）
        int turnCount = history.size() / 2;
        if (turnCount <= COMPACT_THRESHOLD_TURNS) {
            return new ArrayList<>(history);
        }
        // 保留最近 2 轮原文（最后 4 条消息）
        int keepMessages = 4;
        List<AiMessage> recentMessages = history.subList(history.size() - keepMessages, history.size());
        List<AiMessage> olderMessages = history.subList(0, history.size() - keepMessages);

        // 拼接旧对话为文本，请求 LLM 摘要
        StringBuilder olderText = new StringBuilder();
        for (AiMessage msg : olderMessages) {
            String role = msg.getRole() == null ? "unknown" : msg.getRole();
            String content = msg.getContent() == null ? "" : msg.getContent();
            olderText.append("[").append(role).append("] ").append(truncate(content, 500)).append("\n");
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

    // ══════════════════════════════════════════════════════════
    // Upgrade #2  Stuck 检测 — 防止 ReAct 死循环
    // ══════════════════════════════════════════════════════════

    private String buildStuckSignature(AiToolCall toolCall) {
        String name = toolCall.getFunction() == null ? "?" : toolCall.getFunction().getName();
        String args = toolCall.getFunction() == null ? "" : String.valueOf(
                toolCall.getFunction().getArguments() == null ? "" : toolCall.getFunction().getArguments());
        return name + "|" + args.hashCode();
    }

    private boolean isStuck(List<String> signatures) {
        if (signatures.size() < STUCK_MAX_REPEAT) {
            return false;
        }
        int sz = signatures.size();
        // 检查1: 完全相同签名连续出现 STUCK_MAX_REPEAT 次（原逻辑）
        String last = signatures.get(sz - 1);
        boolean exactRepeat = true;
        for (int i = sz - STUCK_MAX_REPEAT; i < sz; i++) {
            if (!last.equals(signatures.get(i))) { exactRepeat = false; break; }
        }
        if (exactRepeat) return true;

        // 检查2: 同一工具名连续调用 4+ 次（参数不同也视为卡住）
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

        // 检查3: A-B-A-B 振荡模式（最近4个签名交替出现两种）
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

    // ══════════════════════════════════════════════════════════
    // Upgrade #3 & #5  Pre/Post Hooks + 并发工具执行
    // ══════════════════════════════════════════════════════════

    /** 工具执行结果记录（内部数据结构） */
    private static class ToolExecRecord {
        final String toolCallId;
        final String toolName;
        final String args;
        final String rawResult;
        final String evidence;
        final long elapsedMs;

        ToolExecRecord(String toolCallId, String toolName, String args,
                       String rawResult, String evidence, long elapsedMs) {
            this.toolCallId = toolCallId;
            this.toolName = toolName;
            this.args = args;
            this.rawResult = rawResult;
            this.evidence = evidence;
            this.elapsedMs = elapsedMs;
        }
    }

    private List<ToolExecRecord> executeToolsConcurrently(
            List<AiToolCall> toolCalls,
            Map<String, AgentTool> visibleToolMap,
            String commandId) {

        // 单工具时直接同步执行，避免线程池开销
        if (toolCalls.size() == 1) {
            return List.of(executeSingleTool(toolCalls.get(0), visibleToolMap, commandId));
        }

        // 多工具并发执行
        List<CompletableFuture<ToolExecRecord>> futures = new ArrayList<>();
        for (AiToolCall toolCall : toolCalls) {
            futures.add(CompletableFuture.supplyAsync(
                    () -> executeSingleTool(toolCall, visibleToolMap, commandId),
                    toolExecutor));
        }

        List<ToolExecRecord> records = new ArrayList<>();
        for (CompletableFuture<ToolExecRecord> future : futures) {
            try {
                records.add(future.join());
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

        // ── Pre-Hook: 允许拦截 ──
        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    if (!hook.preToolUse(toolName, arguments)) {
                        log.info("[AiAgent] Hook 拦截工具调用: {}", toolName);
                        rawResult = "{\"error\":\"工具调用被安全策略拦截: " + toolName + "\"}";
                        long elapsed = System.currentTimeMillis() - start;
                        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult,
                                buildToolEvidenceMessage(toolName, rawResult), elapsed);
                    }
                } catch (Exception e) {
                    log.warn("[AiAgent] preToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        // ── 执行工具（含瞬态错误单次重试）──
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

        // ── Post-Hook: 通知 ──
        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    hook.postToolUse(toolName, arguments, rawResult, elapsed, success);
                } catch (Exception e) {
                    log.warn("[AiAgent] postToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        // ── Trace 记录 ──
        try {
            aiAgentTraceOrchestrator.logToolCall(commandId, toolName, arguments, rawResult, elapsed, true);
        } catch (Exception e) {
            log.debug("[AiAgent] trace logToolCall 失败: {}", e.getMessage());
        }

        String evidence = buildToolEvidenceMessage(toolName, rawResult);
        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult, evidence, elapsed);
    }

    /** 判断异常是否为瞬态错误（网络超时/连接重置/服务限流等，值得重试） */
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

    // ══════════════════════════════════════════════════════════
    // Upgrade #4  租户级 AI 记忆增强 — 异步提取对话洞察写入知识库
    // ══════════════════════════════════════════════════════════

    private void enhanceMemoryAsync(String userId, String userMessage, String assistantResponse) {
        CompletableFuture.runAsync(() -> {
            try {
                // 简单对话（单纯闲聊/推荐追问）不值得提取
                if (assistantResponse == null || assistantResponse.length() < 80) {
                    return;
                }
                List<AiMessage> extractPrompt = List.of(
                        AiMessage.system("你是知识提取助手。分析以下对话，如果其中包含有价值的业务洞察（如决策依据、" +
                                "异常处理方案、数据分析结论），则输出一行标题和一段摘要，格式:\n" +
                                "TITLE: 标题\nCONTENT: 摘要\n\n" +
                                "如果对话是简单闲聊/查询且无新洞察，仅输出 SKIP"),
                        AiMessage.user("用户: " + truncate(userMessage, 300) + "\n助手: " + truncate(assistantResponse, 600))
                );
                IntelligenceInferenceResult extractResult = inferenceOrchestrator.chat("memory-extract", extractPrompt, List.of());
                if (!extractResult.isSuccess() || extractResult.getContent() == null) {
                    return;
                }
                String extraction = extractResult.getContent().trim();
                if (extraction.startsWith("SKIP") || !extraction.contains("TITLE:")) {
                    return;
                }
                // 解析 TITLE 和 CONTENT
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
        }, toolExecutor);
    }
}
