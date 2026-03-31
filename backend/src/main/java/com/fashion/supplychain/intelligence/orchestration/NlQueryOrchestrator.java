package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.NlQueryRequest;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.util.Arrays;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * AI 自然语言查询编排器 — 意图识别 + 路由分发
 *
 * <p>数据查询逻辑委托给 {@link NlQueryDataHandlers}，
 * 高级智能查询委托给 {@link NlQuerySmartHandlers}。
 */
@Service
@Slf4j
public class NlQueryOrchestrator {

    @Autowired private NlQuerySmartHandlers smartHandlers;
    @Autowired private NlQueryLearningTracker learningTracker;
    @Autowired private AiAdvisorService aiAdvisorService;
    @Autowired private NlQueryDataHandlers dataHandlers;

    /** 会话上下文缓存: sessionKey → 最近3轮 [question, answer] */
    private final ConcurrentHashMap<String, LinkedList<String[]>> sessionContexts = new ConcurrentHashMap<>();

    public NlQueryResponse query(NlQueryRequest req) {
        String question = req.getQuestion().trim();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        log.info("[NlQuery] question={}, tenant={}, factory={}", question, tenantId, factoryId);

        String sessionId = req.getSessionId() != null ? req.getSessionId() : "";
        String sessionKey = tenantId + ":" + sessionId;

        NlQueryResponse resp;
        try {
            resp = routeIntent(question, tenantId, factoryId, sessionKey);
        } catch (Exception e) {
            log.error("[NL查询] 数据加载异常（降级返回兜底）: {}", e.getMessage(), e);
            resp = new NlQueryResponse();
            resp.setIntent("error");
            resp.setAnswer("系统暂时无法处理您的询问，请稍后重试");
            resp.setConfidence(0);
        }

        // ── 保存会话上下文（多轮对话记忆） ──
        if (!sessionId.isEmpty()) {
            saveToSession(sessionKey, question, resp.getAnswer() != null ? resp.getAnswer() : "");
        }

        // ── 全系统学习：记录每次查询 ──
        try {
            learningTracker.recordQuery(question, resp.getIntent(), resp.getConfidence());
        } catch (Exception ignore) { /* 学习记录不影响业务 */ }

        return resp;
    }

    /** 意图识别路由（LLM优先 → 关键词兜底） */
    private NlQueryResponse routeIntent(String question, Long tenantId, String factoryId, String sessionKey) {
        String contextPrompt = buildContextPrompt(sessionKey);
        // ── 优先尝试 LLM 意图分类（快速超时，失败降级关键词） ──
        String llmIntent = classifyIntentByLlm(question, tenantId, contextPrompt);
        if (llmIntent != null) {
            NlQueryResponse resp = dispatchByIntent(llmIntent, question, tenantId, factoryId);
            if (resp != null) {
                log.info("[NlQuery] LLM意图命中: intent={}", llmIntent);
                return resp;
            }
        }

        // ── 关键词匹配兜底 ──
        // 1) 具体订单查询（含订单号或"订单+进度"）
        if (NlQueryDataHandlers.ORDER_NO_PATTERN.matcher(question).find()
                || (containsAny(question, "订单") && containsAny(question, "进度", "多少", "怎样", "如何", "状态"))) {
            return dataHandlers.handleOrderQuery(question, tenantId, factoryId);
        }
        // 2) 延期/逾期
        if (containsAny(question, "延期", "逾期", "超期", "过期")) {
            return dataHandlers.handleOverdueQuery(tenantId, factoryId);
        }
        // 3) 对比/趋势
        if (containsAny(question, "昨天", "昨日", "环比", "同比", "对比", "比较", "趋势", "变化")) {
            return dataHandlers.handleCompareQuery(tenantId, factoryId);
        }
        // 4) 系统健康
        if (containsAny(question, "健康", "健康度", "健康指数", "评分", "打分", "得分")) {
            return smartHandlers.handleHealthQuery();
        }
        // 5) 瓶颈
        if (containsAny(question, "瓶颈", "堵塞", "积压", "卡住")) {
            return smartHandlers.handleBottleneckQuery();
        }
        // 6) 交期风险
        if (containsAny(question, "风险", "高风险", "危险", "能按时交吗", "来得及")) {
            return smartHandlers.handleRiskQuery();
        }
        // 7) 异常告警
        if (containsAny(question, "异常", "告警", "预警", "警报", "报警")) {
            return smartHandlers.handleAnomalyQuery();
        }
        // 8) 产量/扫码
        if (containsAny(question, "产量", "扫码", "今日", "今天", "多少件")) {
            return dataHandlers.handleProductionQuery(tenantId, factoryId);
        }
        // 9) 质检/缺陷
        if (containsAny(question, "缺陷", "不良分布", "热力图")) {
            return smartHandlers.handleDefectQuery();
        }
        if (containsAny(question, "质检", "质量", "通过率", "良品率", "合格率", "不良")) {
            return dataHandlers.handleQualityQuery(tenantId, factoryId);
        }
        // 10) 工厂（升级为排行榜）
        if (containsAny(question, "工厂", "车间", "哪个厂", "哪家")) {
            return smartHandlers.handleFactoryRankingQuery();
        }
        // 11) 产能/脉搏/停工停滞
        if (containsAny(question, "产能", "负荷", "脉搏", "忙不忙", "实时",
                "停工", "停滞", "沉默", "没有扫码", "停产", "哪些工厂", "工厂状态")) {
            return smartHandlers.handlePulseQuery();
        }
        // 12) 员工效率（升级为多维评估）
        if (containsAny(question, "效率", "绩效", "排名", "谁最", "最快", "最好", "人员", "人数", "工人")) {
            return smartHandlers.handleWorkerEfficiencyQuery();
        }
        // 13) 入库/仓库
        if (containsAny(question, "入库", "仓库", "出库", "库存")) {
            return dataHandlers.handleWarehousingQuery(tenantId, factoryId);
        }
        // 14) 裁剪
        if (containsAny(question, "裁剪", "裁片", "菲号")) {
            return dataHandlers.handleCuttingQuery(tenantId, factoryId);
        }
        // 15) 成本/利润（升级为利润预估）
        if (containsAny(question, "成本", "利润", "费用", "花了", "赚了", "毛利")) {
            return smartHandlers.handleCostQuery();
        }
        // 16) 生产节拍
        if (containsAny(question, "节拍", "节律", "DNA", "节奏")) {
            return smartHandlers.handleRhythmQuery();
        }
        // 17) 排程建议
        if (containsAny(question, "排程", "排产", "排单", "安排", "调度")) {
            return smartHandlers.handleSchedulingQuery();
        }
        // 18) 通知/提醒
        if (containsAny(question, "通知", "提醒", "消息", "待办")) {
            return smartHandlers.handleNotificationQuery();
        }
        // 19) 系统自检
        if (containsAny(question, "自检", "诊断", "修复", "自愈")) {
            return smartHandlers.handleSelfHealingQuery();
        }
        // 20) 学习报告
        if (containsAny(question, "学习", "学了什么", "置信度", "训练")) {
            return smartHandlers.handleLearningReportQuery();
        }
        // 20.1) 根因分析
        if (containsAny(question, "根因", "原因分析", "为什么会", "为什么", "背后原因")) {
            return smartHandlers.handleRootCauseQuery(question);
        }
        // 20.2) 规律发现
        if (containsAny(question, "规律", "模式", "趋势规律", "发现什么规律")) {
            return smartHandlers.handlePatternQuery();
        }
        // 20.3) 目标拆解
        if (containsAny(question, "目标", "拆解", "计划", "路线", "怎么推进")) {
            return smartHandlers.handleGoalQuery(question);
        }
        // 20.4) Agent 例会
        if (containsAny(question, "例会", "会议", "讨论", "辩论", "共识")) {
            return smartHandlers.handleMeetingQuery(question);
        }

        // 21.1) 报价建议 → 成本查询（报价核心数据源相同）
        if (containsAny(question, "报价", "估价", "估算")) {
            return smartHandlers.handleCostQuery();
        }
        // 21.2) 供应商评分/综合评分 → 工厂排名（同一数据域）
        if (containsAny(question, "供应商评分", "综合评分", "评分排行")) {
            return smartHandlers.handleFactoryRankingQuery();
        }
        // 21.3) 智能派工 → 员工效率（派工依据）
        if (containsAny(question, "派工", "派单")) {
            return smartHandlers.handleWorkerEfficiencyQuery();
        }
        // 21.4) 待审批执行命令 → 风险订单（最需要执行操作的）
        if (containsAny(question, "AI命令", "执行命令", "执行")) {
            return smartHandlers.handleRiskQuery();
        }
        // 21.4b) 变更审批（路由到AI对话，由 tool_change_approval 处理）
        if (containsAny(question, "待审批", "审批")) {
            NlQueryResponse resp = new NlQueryResponse();
            resp.setIntent("ai_chat");
            resp.setAnswer("审批相关操作已集成到小云AI对话中 💬\n\n请在AI对话框中输入「帮我看看审批」，小云会为您列出待审批申请，并支持直接通过或驳回。");
            resp.setConfidence(90);
            return resp;
        }
        // 21.5) 财务/资金审核 → 成本分析（财务核心查询）
        if (containsAny(question, "资金异常", "资金流向", "资金分析", "财务分析", "回款异常", "对账")) {
            return smartHandlers.handleCostQuery();
        }

        // 22) 帮助
        if (containsAny(question, "帮助", "能做什么", "你会什么", "功能", "怎么用", "你好")) {
            return dataHandlers.handleHelpQuery();
        }
        // 23) 总览/概况
        if (containsAny(question, "总览", "概况", "汇总", "情况", "怎么样", "报告", "整体")) {
            return dataHandlers.handleSummaryQuery(tenantId, factoryId);
        }

        // ── 智能底：调用 DeepSeek 处理无法匹配关键词的自由问题
        return dataHandlers.handleAiDeepFallback(question, tenantId, factoryId);
    }

    // ── 工具方法 ──

    private boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw)) return true;
        }
        return false;
    }

    // ── LLM 意图分类 ──

    private static final List<String> KNOWN_INTENTS = Arrays.asList(
            "order_query", "overdue", "compare", "health", "bottleneck", "risk", "anomaly",
            "production", "defect", "quality", "factory_ranking", "pulse", "worker_efficiency",
            "warehousing", "cutting", "cost", "rhythm", "scheduling", "notification",
            "self_healing", "learning", "root_cause", "pattern", "goal", "meeting",
            "quote", "supplier_scorecard", "smart_assignment",
            "execution", "finance_audit", "help", "summary"
    );

    private static final String LLM_INTENT_PROMPT =
            "你是一个意图分类器。根据用户问题，从以下意图列表中选择最匹配的一个意图，只返回意图名称（英文），"
            + "不要解释不要加任何前缀后缀。如果无法匹配任何意图，返回 unknown。\n"
            + "意图列表：\n"
            + "order_query - 查询具体订单信息/进度\n"
            + "overdue - 延期/逾期/超期订单\n"
            + "compare - 对比/环比/同比/趋势\n"
            + "health - 健康指数/系统健康/生产健康\n"
            + "bottleneck - 瓶颈/卡点/堵塞\n"
            + "risk - 风险/预警/高危\n"
            + "anomaly - 异常/波动/突变\n"
            + "production - 今日产量/扫码数量/产出\n"
            + "defect - 次品/不良/次品率\n"
            + "quality - 质检/合格率/验收\n"
            + "factory_ranking - 工厂排名/排行/谁最快\n"
            + "pulse - 实时脉搏/动态/正在发生\n"
            + "worker_efficiency - 工人效率/产量最高/谁最快\n"
            + "warehousing - 入库/出库/库存\n"
            + "cutting - 裁剪/裁片/分菲\n"
            + "cost - 成本/费用/单价\n"
            + "rhythm - 节奏/DNA/生产规律\n"
            + "scheduling - 排期/排产/调度\n"
            + "notification - 通知/消息/提醒\n"
            + "self_healing - 自动修复/自愈/系统修复\n"
            + "learning - 学习/报告/培训\n"
            + "root_cause - 根因/原因分析/为什么会发生\n"
            + "pattern - 规律/模式/反复出现的问题\n"
            + "goal - 目标拆解/推进计划/行动路径\n"
            + "meeting - 例会/会议/共识讨论/多方辩论\n"
            + "quote - 报价/估价/定价\n"
            + "supplier_scorecard - 供应商评分/供应商排名\n"
            + "smart_assignment - 智能派工/排班/分配\n"
            + "execution - 执行/命令/操作\n"
            + "finance_audit - 财务/资金/对账\n"
            + "help - 帮助/功能/你能做什么\n"
            + "summary - 总览/概况/汇总/整体情况\n";

    /** 调用 DeepSeek 进行意图分类，失败返回 null */
    private String classifyIntentByLlm(String question, Long tenantId, String contextPrompt) {
        try {
            if (!aiAdvisorService.isEnabled()) return null;
            String userMsg = contextPrompt.isEmpty() ? "用户问题：" + question
                    : contextPrompt + "\n用户当前问题：" + question;
            String reply = aiAdvisorService.chat(LLM_INTENT_PROMPT, userMsg);
            if (reply == null || reply.isBlank()) return null;
            String intent = reply.trim().toLowerCase().replaceAll("[^a-z_]", "");
            if (KNOWN_INTENTS.contains(intent)) return intent;
            log.debug("[NlQuery] LLM返回未知意图: raw={} cleaned={}", reply.trim(), intent);
            return null;
        } catch (Exception e) {
            log.debug("[NlQuery] LLM意图分类失败，降级关键词: {}", e.getMessage());
            return null;
        }
    }

    /** 根据意图名称分发到对应处理方法，不存在返回 null */
    private NlQueryResponse dispatchByIntent(String intent, String question, Long tenantId, String factoryId) {
        switch (intent) {
            case "order_query":       return dataHandlers.handleOrderQuery(question, tenantId, factoryId);
            case "overdue":           return dataHandlers.handleOverdueQuery(tenantId, factoryId);
            case "compare":           return dataHandlers.handleCompareQuery(tenantId, factoryId);
            case "health":            return smartHandlers.handleHealthQuery();
            case "bottleneck":        return smartHandlers.handleBottleneckQuery();
            case "risk":              return smartHandlers.handleRiskQuery();
            case "anomaly":           return smartHandlers.handleAnomalyQuery();
            case "production":        return dataHandlers.handleProductionQuery(tenantId, factoryId);
            case "defect":            return smartHandlers.handleDefectQuery();
            case "quality":           return dataHandlers.handleQualityQuery(tenantId, factoryId);
            case "factory_ranking":   return smartHandlers.handleFactoryRankingQuery();
            case "pulse":             return smartHandlers.handlePulseQuery();
            case "worker_efficiency": return smartHandlers.handleWorkerEfficiencyQuery();
            case "warehousing":       return dataHandlers.handleWarehousingQuery(tenantId, factoryId);
            case "cutting":           return dataHandlers.handleCuttingQuery(tenantId, factoryId);
            case "cost":              return smartHandlers.handleCostQuery();
            case "rhythm":            return smartHandlers.handleRhythmQuery();
            case "scheduling":        return smartHandlers.handleSchedulingQuery();
            case "notification":      return smartHandlers.handleNotificationQuery();
            case "self_healing":      return smartHandlers.handleSelfHealingQuery();
            case "learning":          return smartHandlers.handleLearningReportQuery();
            case "quote":             return smartHandlers.handleCostQuery();
            case "supplier_scorecard":return smartHandlers.handleFactoryRankingQuery();
            case "smart_assignment":  return smartHandlers.handleWorkerEfficiencyQuery();
            case "execution":         return smartHandlers.handleRiskQuery();
            case "finance_audit":     return smartHandlers.handleCostQuery();
            case "help":              return dataHandlers.handleHelpQuery();
            case "summary":           return dataHandlers.handleSummaryQuery(tenantId, factoryId);
            case "root_cause":        return smartHandlers.handleRootCauseQuery(question);
            case "pattern":           return smartHandlers.handlePatternQuery();
            case "goal":              return smartHandlers.handleGoalQuery(question);
            case "meeting":           return smartHandlers.handleMeetingQuery(question);
            default:                  return null;
        }
    }

    // ── 会话上下文工具方法 ──

    private String buildContextPrompt(String sessionKey) {
        LinkedList<String[]> history = sessionContexts.get(sessionKey);
        if (history == null || history.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("【对话历史（最近3轮）】\n");
        for (String[] qa : history) {
            sb.append("Q: ").append(qa[0]).append("\nA: ").append(qa[1]).append("\n");
        }
        return sb.toString();
    }

    private void saveToSession(String sessionKey, String question, String answer) {
        LinkedList<String[]> history = sessionContexts.computeIfAbsent(sessionKey, k -> new LinkedList<>());
        history.addLast(new String[]{
            question,
            answer.length() > 200 ? answer.substring(0, 200) + "…" : answer
        });
        while (history.size() > 3) history.removeFirst();
    }
}
