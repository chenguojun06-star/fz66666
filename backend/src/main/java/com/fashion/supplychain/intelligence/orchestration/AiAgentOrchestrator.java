package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private List<AgentTool> registeredTools;

    @Autowired
    private AiContextBuilderService aiContextBuilderService;

    @Autowired
    private AiMemoryOrchestrator aiMemoryOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    private Map<String, AgentTool> toolMap;
    private List<AiTool> apiTools;

    /** 对话记忆：userId → 最近 N 轮 user+assistant 消息 */
    private final ConcurrentHashMap<String, List<AiMessage>> conversationMemory = new ConcurrentHashMap<>();
    private static final int MAX_MEMORY_TURNS = 6; // 保留最近6轮（12条消息）
    private static final int MAX_USERS_CACHED = 200; // 超过则清理最早的

    @PostConstruct
    public void init() {
        toolMap = new HashMap<>();
        apiTools = new ArrayList<>();
        if (registeredTools != null) {
            for (AgentTool tool : registeredTools) {
                toolMap.put(tool.getName(), tool);
                apiTools.add(tool.getToolDefinition());
                log.info("[AiAgent] 已注册工具: {}", tool.getName());
            }
        }
    }

    public Result<String> executeAgent(String userMessage) {
        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        String userId = UserContext.userId();
        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system(buildSystemPrompt(userMessage)));
        // 加载对话记忆（最近 N 轮）
        List<AiMessage> history = getConversationHistory(userId);
        messages.addAll(history);
        messages.add(AiMessage.user(userMessage));

        int maxIterations = 5;
        int currentIter = 0;

        while (currentIter < maxIterations) {
            currentIter++;
            log.info("[AiAgent] 开始第 {} 轮思考...", currentIter);

            IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, apiTools);
            if (!result.isSuccess()) {
                log.error("[AiAgent] 推理失败: {}", result.getErrorMessage());
                return Result.fail("推理服务暂时不可用: " + result.getErrorMessage());
            }

            // LLM Response
            AiMessage assistantMessage = AiMessage.assistant(result.getContent());

            // Handle Tool Calls
            if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                assistantMessage.setTool_calls(result.getToolCalls());
                messages.add(assistantMessage);

                for (AiToolCall toolCall : result.getToolCalls()) {
                    String toolName = toolCall.getFunction().getName();
                    String args = toolCall.getFunction().getArguments();
                    log.info("[AiAgent] LLM 决定调用工具: {} | args: {}", toolName, args);

                    AgentTool tool = toolMap.get(toolName);
                    String toolResult;
                    if (tool == null) {
                        toolResult = "{\"error\": \"工具不存在: " + toolName + "\"}";
                    } else {
                        try {
                            toolResult = tool.execute(args);
                        } catch (Exception e) {
                            log.error("[AiAgent] 工具执行异常", e);
                            toolResult = "{\"error\": \"执行失败: " + e.getMessage() + "\"}";
                        }
                    }
                    log.info("[AiAgent] 工具调用结果:\n{}", toolResult);
                    messages.add(AiMessage.tool(toolResult, toolCall.getId(), toolName));
                }
            } else {
                // Done!
                log.info("[AiAgent] 完成任务，返回给用户");
                saveConversationTurn(userId, userMessage, result.getContent());
                return Result.success(result.getContent());
            }
        }

        return Result.fail("对话轮数超过限制 (" + maxIterations + ")，可能陷入了死循环。");
    }

    /**
     * SSE 流式执行 Agent：每一轮思考/工具调用/最终回答都通过 SseEmitter 推送给前端。
     * 事件类型：thinking | tool_call | tool_result | answer | error | done
     */
    public void executeAgentStreaming(String userMessage, SseEmitter emitter) {
        try {
            if (!inferenceOrchestrator.isAnyModelEnabled()) {
                emitSse(emitter, "error", Map.of("message", "智能服务暂未配置或不可用"));
                emitter.complete();
                return;
            }

            List<AiMessage> messages = new ArrayList<>();
            messages.add(AiMessage.system(buildSystemPrompt(userMessage)));
            String userId = UserContext.userId();
            List<AiMessage> history = getConversationHistory(userId);
            messages.addAll(history);
            messages.add(AiMessage.user(userMessage));

            int maxIterations = 5;
            for (int i = 1; i <= maxIterations; i++) {
                emitSse(emitter, "thinking", Map.of("iteration", i, "message", "正在思考第 " + i + " 轮…"));

                IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, apiTools);
                if (!result.isSuccess()) {
                    emitSse(emitter, "error", Map.of("message", "推理服务暂时不可用: " + result.getErrorMessage()));
                    emitter.complete();
                    return;
                }

                AiMessage assistantMessage = AiMessage.assistant(result.getContent());

                if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                    assistantMessage.setTool_calls(result.getToolCalls());
                    messages.add(assistantMessage);

                    for (AiToolCall toolCall : result.getToolCalls()) {
                        String toolName = toolCall.getFunction().getName();
                        String args = toolCall.getFunction().getArguments();
                        emitSse(emitter, "tool_call", Map.of("tool", toolName, "arguments", args));

                        AgentTool tool = toolMap.get(toolName);
                        String toolResult;
                        if (tool == null) {
                            toolResult = "{\"error\": \"工具不存在: " + toolName + "\"}";
                        } else {
                            try {
                                toolResult = tool.execute(args);
                            } catch (Exception e) {
                                log.error("[AiAgent-Stream] 工具执行异常", e);
                                toolResult = "{\"error\": \"执行失败: " + e.getMessage() + "\"}";
                            }
                        }
                        emitSse(emitter, "tool_result", Map.of("tool", toolName, "success", !toolResult.contains("\"error\"")));
                        messages.add(AiMessage.tool(toolResult, toolCall.getId(), toolName));
                    }
                } else {
                    // 最终回答
                    saveConversationTurn(userId, userMessage, result.getContent());
                    emitSse(emitter, "answer", Map.of("content", result.getContent()));
                    emitSse(emitter, "done", Map.of());
                    emitter.complete();
                    return;
                }
            }

            emitSse(emitter, "error", Map.of("message", "对话轮数超过限制"));
            emitter.complete();

        } catch (Exception e) {
            log.error("[AiAgent-Stream] 流式执行异常", e);
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
        // 防止内存膨胀：超过 MAX_USERS_CACHED 时清空最早缓存
        if (conversationMemory.size() > MAX_USERS_CACHED) {
            conversationMemory.clear();
            log.info("[AiAgent] 对话缓存超过{}用户，已清空", MAX_USERS_CACHED);
        }
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

    private String buildSystemPrompt(String userMessage) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        // 判断是否具备管理权限（老板/超管/管理角色）
        boolean isManager = isSuperAdmin || isTenantOwner || (userRole != null &&
                java.util.Arrays.asList("admin", "super_admin", "manager", "supervisor",
                        "tenant_admin", "tenant_manager", "merchandiser")
                        .stream().anyMatch(r -> userRole.toLowerCase().contains(r)));
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
                    "可以回答：扫码记录查询、本人负责的订单进度、当前生产任务状态、本人产量与计件工资估算。\n" +
                    "禁止回答：全厂汇总数据、财务结算总览、其他员工工资、管理层报告、仓库/CRM/采购等管理功能。\n" +
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

        // ── Voyage 语义检索 — 相关历史经验（RAG）──
        String ragContext = "";
        try {
            if (userMessage != null && !userMessage.isBlank()) {
                Long ragTenantId = UserContext.tenantId();
                IntelligenceMemoryResponse ragResult =
                        intelligenceMemoryOrchestrator.recallSimilar(ragTenantId, userMessage, 3);
                List<IntelligenceMemoryResponse.MemoryItem> recalled = ragResult.getRecalled();
                if (recalled != null && !recalled.isEmpty()) {
                    List<IntelligenceMemoryResponse.MemoryItem> relevant = recalled.stream()
                            .filter(item -> item.getSimilarityScore() >= 0.60f)
                            .collect(Collectors.toList());
                    if (!relevant.isEmpty()) {
                        StringBuilder rag = new StringBuilder();
                        rag.append("【Voyage 语义检索 — 相关历史经验参考（相似度≥0.60）】\n");
                        for (int ri = 0; ri < relevant.size(); ri++) {
                            IntelligenceMemoryResponse.MemoryItem item = relevant.get(ri);
                            String c = item.getContent();
                            if (c != null && c.length() > 150) c = c.substring(0, 150) + "…";
                            rag.append(String.format("  %d. [%s] %s（相似度%.2f）\n     %s\n",
                                    ri + 1,
                                    item.getMemoryType() != null ? item.getMemoryType() : "case",
                                    item.getTitle() != null ? item.getTitle() : "",
                                    item.getSimilarityScore(),
                                    c != null ? c : ""));
                        }
                        rag.append("（以上为历史经验参考，判断须以工具查询的实时数据为准）\n\n");
                        ragContext = rag.toString();
                        log.debug("[AiAgent-RAG] 本次问题语义检索到 {} 条相关经验", relevant.size());
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[AiAgent-RAG] Voyage 语义检索跳过（Qdrant 未启用或失败）: {}", e.getMessage());
        }

        return "你是小云，服装供应链运营助理。禁止捏造数据。\n\n" +
                contextBlock + "\n" +
                workerRestriction +
                intelligenceContext + "\n" +
                memoryContext +
                ragContext +
                "可用工具：system_overview / query_production_progress / smart_report(daily/weekly/monthly) / " +
                "deep_analysis(factory_ranking/bottleneck/merchandiser_load/delivery_risk/cost_analysis/order_type_breakdown) / " +
                "action_executor(mark_urgent/remove_urgent/add_remark/send_notification) / " +
                "query_style_info / query_warehouse_stock / query_financial_payroll / " +
                "sample_stock / finished_product_stock / query_crm_customer / query_system_user / change_approval\n\n" +
                "回答规则（强制）：\n" +
                "1. 普通问答≤5行。日报/周报/月报例外：第1行=总览数字摘要，之后每条逾期/高风险订单各占一行，固定格式：🔴 {订单号} | {数量}件 | 进度{%} | 逾期{N}天 | 工厂:{factoryName} | 跟单:{merchandiser}；不受5行限制。\n" +
                "2. 禁止【结论】【依据】【建议】【分析】等标题块；报表里「逾期订单」「高风险订单」「生产建议」作为小节分隔符允许。\n" +
                "3. 数据行每行带具体数字；factoryName和merchandiser有值时必须显示，不可省略。\n" +
                "4. 可执行动作最多2条，写在最后。\n" +
                "5. 风险用 🔴🟠🟡🟢 标记，不展开解释。\n" +
                "6. 写操作先1句话确认再执行。执行后返回：✅操作+结果。\n" +
                "7. 语气直接克制，不卖萌，不用语气词。\n\n" +
                "富媒体（有数据时选填）：\n" +
                "图表：```CHART_JSON\\n{...}\\n```\n" +
                "按钮：```ACTIONS_JSON\\n[{\"label\":\"...\",\"command\":\"...\",\"args\":{...},\"style\":\"primary|danger|default\"}]\\n```\n" +
                "仅用真实数据，订单号须数据库中存在。\n";
    }

    /** 将当前用户的会话记忆异步持久化（由 Controller 在会话结束时调用） */
    public void saveCurrentConversationToMemory() {
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        List<AiMessage> msgs = getConversationHistory(userId);
        aiMemoryOrchestrator.saveConversation(tenantId, userId, msgs);
    }

    private void emitSse(SseEmitter emitter, String eventName, Map<String, Object> data) {
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(mapper.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }
}
