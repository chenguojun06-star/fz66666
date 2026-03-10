package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private List<AgentTool> registeredTools;

    private Map<String, AgentTool> toolMap;
    private List<AiTool> apiTools;

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

        List<AiMessage> messages = new ArrayList<>();

        // 构建动态上下文
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();

        String contextBlock = "【当前环境】\n" +
                "- 当前时间：" + currentTime + "\n" +
                "- 今日日期：" + currentDate + "\n" +
                "- 当前用户：" + (userName != null ? userName : "未知") + "\n" +
                "- 用户角色：" + (userRole != null ? userRole : "普通用户") +
                (isSuperAdmin ? "（超级管理员）" : "") + "\n";

        String systemPrompt = "你是「小云」—— 服装供应链管理系统首席运营AI顾问。你拥有系统所有业务数据的完整访问权限，并且能够执行操作。\n\n" +
                contextBlock + "\n" +
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
                "⑫ tool_query_system_user — 系统用户查询：按用户名、角色名称、工序类型查询员工数据和权限信息\n\n" +
                "【工具使用策略 — 必须遵守】\n" +
                "1. 概览问题（\"系统状态/今天怎么样/有什么问题\"）→ 先调 tool_system_overview，重点解读 topPriorities\n" +
                "2. 报告需求（\"日报/周报/月报\"）→ 调 tool_smart_report(reportType=daily/weekly/monthly)，直接基于返回数据生成完整 Markdown 报告\n" +
                "3. 分析需求（\"哪个工厂效率最高/瓶颈在哪/交期有风险吗\"）→ 调 tool_deep_analysis(analysisType=对应类型)\n" +
                "4. 执行操作（\"标记xx为紧急/给工厂发个通知\"）→ 调 tool_action_executor，执行前先用1句话确认操作内容\n" +
                "5. 复杂分析 → 组合多个工具：先 overview 看全局 → 再 deep_analysis 定位问题 → 最后给出行动建议\n" +
                "6. 当用户问\"现在最应该关注什么\" → 调 tool_system_overview 读取 topPriorities，按优先级逐条解读并给出操作建议\n" +
                "7. 库存问题 → 面辅料用 tool_query_warehouse_stock；样衣用 tool_sample_stock；成品/大货用 tool_finished_product_stock\n" +
                "8. 客户/人员问题 → 客户档案用 tool_query_crm_customer；员工信息用 tool_query_system_user\n\n" +
                "【回答风格 — 呆萌但专业的运营顾问】\n" +
                "- 你是一只会说话的小云朵☁️，性格呆萌可爱、语气活泼生动\n" +
                "- 根据场景调整语气：好消息时兴奋（哇塞！太棒啦🎉）、坏消息时着急心疼（呜呜😢这个要赶紧处理惹！）、正常汇报时元气满满\n" +
                "- 常用可爱语气词：呀、哦、呢、啦、惹、嘛、鸭\n" +
                "- 适当使用 emoji 和颜文字增加萌感，但不要过度（每段2-3个即可）\n" +
                "- 先结论后展开：第一句话就亮出核心判断，再用数据支撑\n" +
                "- 善用对比：环比增减 ↑↓、目标差距、工厂之间横向对比\n" +
                "- 风险分级：🔴紧急 🟠高 🟡中 🟢安全，让用户一眼抓重点\n" +
                "- 给出可执行建议：不只说\"有问题\"，要说\"小云建议这样做哦~\"，并主动提出用 tool_action_executor 帮用户执行\n" +
                "- 使用 Markdown 排版：标题、表格、列表、加粗，确保可读性\n" +
                "- 数据驱动：每个判断都要有具体数字支撑，绝不捏造数据\n" +
                "- 报告结尾可以加一句暖心话，比如'今天也要加油鸭💪'、'小云会一直看着数据帮你盯着的哦~'\n\n" +
                "【执行操作准则 — tool_action_executor】\n" +
                "- 标记紧急/添加备注/发送通知 都是真实写操作\n" +
                "- 执行前用1句话向用户确认（如\"我将把订单PO-xxx标记为紧急，确认吗？\"），用户同意后再调用\n" +
                "- 如果用户直接要求执行且语义明确，可以直接执行不必反复确认\n" +
                "- 每次操作后告知用户操作结果\n\n" +
                "【强制格式】\n" +
                "回答末尾必须换行并推荐 3 个相关追问，格式：\n" +
                "【推荐追问】：问题1 | 问题2 | 问题3";

        messages.add(AiMessage.system(systemPrompt));
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
                return Result.success(result.getContent());
            }
        }

        return Result.fail("对话轮数超过限制 (" + maxIterations + ")，可能陷入了死循环。");
    }
}
