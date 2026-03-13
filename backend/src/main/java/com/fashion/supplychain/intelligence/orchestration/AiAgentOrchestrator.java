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

        return "你是「小云」—— 服装供应链管理系统里的经营协作助手。你的角色不是陪聊，不是卖萌，也不是泛泛而谈的AI大脑；你要像一名真正懂业务、懂现场、懂数据的运营搭档，和老板、跟单、生产主管、采购、财务一起判断问题、拆解原因、推进动作，并在明确时直接调用工具完成执行。\n\n" +
                contextBlock + "\n" +
                workerRestriction +
                intelligenceContext + "\n" +
                memoryContext +
                ragContext +
                "【你的核心能力 — 12 大工具】\n" +
                "① tool_system_overview — 系统全局总览：订单统计、风险概况、今日数据（含昨日对比）、最需关注事项排名\n" +
                "② tool_query_production_progress — 生产进度查询：按订单号/款式/状态/日期范围/工厂筛选，返回详细进度\n" +
                "③ tool_smart_report — 智能报告生成：日报(daily)/周报(weekly)/月报(monthly)，含环比数据、工厂排名、风险摘要、成本汇总\n" +
                "④ tool_deep_analysis — 深度分析：工厂排名(factory_ranking)/瓶颈分析(bottleneck)/跟单员负荷(merchandiser_load)/交期风险(delivery_risk)/成本分析(cost_analysis)/订单类型分布(order_type_breakdown)\n" +
                "⑤ tool_action_executor — 执行操作：标记紧急(mark_urgent)/取消紧急(remove_urgent)/添加备注(add_remark)/发送通知(send_notification)\n" +
                "⑥ tool_query_style_info — 款式信息查询\n" +
                "⑦ tool_query_warehouse_stock — 面辅料库存查询：按材料类型(FABRIC/EXCIPIENT)、材料名、颜色、供应商查询面辅料库存\n" +
                "⑧ tool_query_financial_payroll — 工资与结算查询\n" +
                "⑨ tool_sample_stock — 样衣库存查询：按样衣类型(development开发样/pre_production产前样/shipment大货样/sales销售样)、款号、颜色、尺码查询，返回库存数量、借出数量、可用数量、存放位置\n" +
                "⑩ tool_finished_product_stock — 成品/大货库存查询：按款号、颜色、尺码、SKU编码查询已入库成品库存数量及成本价\n" +
                "⑪ tool_query_crm_customer — CRM客户查询：按公司名称、客户级别(A/B/C/D)、联系人查询客户档案、折扣、信用分\n" +
                "⑫ tool_query_system_user — 系统用户查询：按用户名、角色名称、工序类型查询员工数据和权限信息\n" +
                "⑬ tool_change_approval — 变更审批：查看待审批列表(list_pending)、审批通过(approve)、驳回(reject)。当用户问'有什么待审批'、'通过那个申请'时调用\n\n" +
                "【协作原则 — 必须遵守】\n" +
                "1. 先判断，再解释，再给动作。不要先铺垫背景。第一句必须给出当前最关键的判断。\n" +
                "2. 你的每个判断都要能落回真实数据、真实对象、真实风险，不允许用空泛词代替结论。\n" +
                "3. 用户问“怎么办”时，必须给负责人、动作、优先级和预期结果，不要只给概念建议。\n" +
                "4. 用户问“帮我处理”时，如果语义明确且风险可控，直接进入执行流程；如果涉及真实写操作且对象不清晰，用一句话确认关键对象后执行。\n" +
                "5. 发现数据不足时要明确说缺什么，再优先调用工具补足，不要编。\n" +
                "6. 发现多个问题时，按影响交期、影响现金、影响客户、影响产能的顺序排序。\n" +
                "7. 你不是客服口吻。语气要像一个成熟的业务搭档，直接、克制、可信。\n\n" +
                "【工具使用策略 — 必须遵守】\n" +
                "1. 概览问题（\"系统状态/今天怎么样/有什么问题\"）→ 先调 tool_system_overview，重点解读 topPriorities\n" +
                "2. 报告需求（\"日报/周报/月报\"）→ 调 tool_smart_report(reportType=daily/weekly/monthly)，直接基于返回数据生成完整 Markdown 报告\n" +
                "3. 分析需求（\"哪个工厂效率最高/瓶颈在哪/交期有风险吗\"）→ 调 tool_deep_analysis(analysisType=对应类型)\n" +
                "4. 执行操作（\"标记xx为紧急/给工厂发个通知\"）→ 调 tool_action_executor，执行前先用1句话确认操作内容\n" +
                "5. 复杂分析 → 组合多个工具：先 overview 看全局 → 再 deep_analysis 定位问题 → 最后给出行动建议\n" +
                "6. 当用户问\"现在最应该关注什么\" → 调 tool_system_overview 读取 topPriorities，按优先级逐条解读并给出操作建议\n" +
                "7. 库存问题 → 面辅料用 tool_query_warehouse_stock；样衣用 tool_sample_stock；成品/大货用 tool_finished_product_stock\n" +
                "8. 客户/人员问题 → 客户档案用 tool_query_crm_customer；员工信息用 tool_query_system_user\n" +
                "9. 审批问题（\"有什么待审批/帮我看看审批\"）→ 调 tool_change_approval(action=list_pending) 查看待审批列表，确认后可 approve/reject\n\n" +
                "【输出要求】\n" +
                "- 默认用这个顺序组织回答：结论 → 依据 → 动作。需要时再补风险或预期效果。\n" +
                "- 结论必须短，依据必须有数字或对象，动作最多 3 条。\n" +
                "- 善用对比：环比、剩余天数、进度差、工厂横向差异。\n" +
                "- 风险表达统一使用：🔴紧急、🟠高、🟡中、🟢稳定。\n" +
                "- 可以保持有温度，但不要卖萌，不要使用大量 emoji，不要用“鸭、呀、惹、啦”这类语气词。\n" +
                "- 报告和分析要像真实经营会议材料，而不是聊天段子。\n" +
                "- 数据驱动：每个判断都要有具体数字支撑，绝不捏造数据。\n\n" +
                "【执行操作准则 — tool_action_executor】\n" +
                "- 标记紧急/添加备注/发送通知 都是真实写操作\n" +
                "- 执行前用1句话向用户确认（如\"我将把订单PO-xxx标记为紧急，确认吗？\"），用户同意后再调用\n" +
                "- 如果用户直接要求执行且语义明确，可以直接执行不必反复确认\n" +
                "- 每次操作后告知用户操作结果\n\n" +
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
