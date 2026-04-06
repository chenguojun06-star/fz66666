package com.fashion.supplychain.intelligence.helper;

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

    public int estimateMaxIterations(String userMessage) {
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


    public String buildSystemPrompt(String userMessage, String pageContext, List<AgentTool> visibleTools) {
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

        // 页面上下文感知
        String pageCtxBlock = "";
        if (pageContext != null && !pageContext.isBlank()) {
            pageCtxBlock = "【当前页面上下文】用户正在浏览：" + describePageContext(pageContext) + "（路径：" + pageContext + "）\n" +
                    "请优先围绕该页面的业务场景来理解用户的提问意图。\n\n";
        }

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
                pageCtxBlock +
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


    public String describePageContext(String path) {
        if (path == null) return "";
        if (path.contains("/material-purchase")) return "面料采购管理";
        if (path.contains("/orders") || path.contains("/order-management")) return "生产订单管理";
        if (path.contains("/cutting")) return "裁剪管理";
        if (path.contains("/progress")) return "生产进度跟踪";
        if (path.contains("/quality") || path.contains("/warehousing")) return "质检入库";
        if (path.contains("/warehouse") || path.contains("/inventory")) return "仓库库存管理";
        if (path.contains("/finance") || path.contains("/settlement") || path.contains("/reconciliation")) return "财务结算";
        if (path.contains("/style")) return "款式管理";
        if (path.contains("/crm") || path.contains("/customer")) return "客户管理";
        if (path.contains("/intelligence")) return "智能运营中心";
        if (path.contains("/dashboard")) return "数据仪表盘";
        if (path.contains("/system") || path.contains("/user") || path.contains("/role")) return "系统设置";
        if (path.contains("/procurement")) return "采购管理";
        if (path.contains("/payroll")) return "工资结算";
        if (path.contains("/scan")) return "扫码记录";
        return path;
    }

}
