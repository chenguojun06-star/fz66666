package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.NlQueryRequest;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * AI 自然语言查询编排器 — 将用户自然语言转换为结构化数据查询
 *
 * <p>支持 22 种意图识别（关键字匹配 + 规则引擎，非 LLM）：
 * order_query / overdue / production / compare / quality / factory / capacity / worker
 * / warehousing / summary / cutting / cost / help
 * / health / bottleneck / risk / anomaly / defect / rhythm / scheduling / notification
 * / self_healing / learning_report
 *
 * <p>全系统学习：每次查询自动记录意图命中与置信度，持续改善识别能力。
 */
@Service
@Slf4j
public class NlQueryOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private DashboardQueryService dashboardQueryService;

    @Autowired
    private NlQuerySmartHandlers smartHandlers;

    @Autowired
    private NlQueryLearningTracker learningTracker;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{8,}");

    public NlQueryResponse query(NlQueryRequest req) {
        String question = req.getQuestion().trim();
        Long tenantId = UserContext.tenantId();
        log.info("[NlQuery] question={}, tenant={}", question, tenantId);

        NlQueryResponse resp;
        try {
            resp = routeIntent(question, tenantId);
        } catch (Exception e) {
            log.error("[NL查询] 数据加载异常（降级返回兜底）: {}", e.getMessage(), e);
            resp = new NlQueryResponse();
            resp.setIntent("error");
            resp.setAnswer("系统暂时无法处理您的询问，请稍后重试");
            resp.setConfidence(0);
        }

        // ── 全系统学习：记录每次查询 ──
        try {
            learningTracker.recordQuery(question, resp.getIntent(), resp.getConfidence());
        } catch (Exception ignore) { /* 学习记录不影响业务 */ }

        return resp;
    }

    /** 意图识别路由（LLM优先 → 关键词兜底） */
    private NlQueryResponse routeIntent(String question, Long tenantId) {
        // ── 优先尝试 LLM 意图分类（快速超时，失败降级关键词） ──
        String llmIntent = classifyIntentByLlm(question, tenantId);
        if (llmIntent != null) {
            NlQueryResponse resp = dispatchByIntent(llmIntent, question, tenantId);
            if (resp != null) {
                log.info("[NlQuery] LLM意图命中: intent={}", llmIntent);
                return resp;
            }
        }

        // ── 关键词匹配兜底 ──
        // 1) 具体订单查询（含订单号或"订单+进度"）
        if (ORDER_NO_PATTERN.matcher(question).find()
                || (containsAny(question, "订单") && containsAny(question, "进度", "多少", "怎样", "如何", "状态"))) {
            return handleOrderQuery(question, tenantId);
        }
        // 2) 延期/逾期
        if (containsAny(question, "延期", "逾期", "超期", "过期")) {
            return handleOverdueQuery(tenantId);
        }
        // 3) 对比/趋势
        if (containsAny(question, "昨天", "昨日", "环比", "同比", "对比", "比较", "趋势", "变化")) {
            return handleCompareQuery(tenantId);
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
            return handleProductionQuery(tenantId);
        }
        // 9) 质检/缺陷
        if (containsAny(question, "缺陷", "不良分布", "热力图")) {
            return smartHandlers.handleDefectQuery();
        }
        if (containsAny(question, "质检", "质量", "通过率", "良品率", "合格率", "不良")) {
            return handleQualityQuery(tenantId);
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
            return handleWarehousingQuery(tenantId);
        }
        // 14) 裁剪
        if (containsAny(question, "裁剪", "裁片", "菲号")) {
            return handleCuttingQuery(tenantId);
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

        // 20.1) 报价建议
        if (containsAny(question, "报价", "估价", "估算")) {
            return handleDirectWidget("quote", "已经为您调取智能款式报价分析：");
        }
        // 20.2) 供应商评分/综合评分
        if (containsAny(question, "供应商评分", "综合评分", "评分排行")) {
            return handleDirectWidget("supplier_scorecard", "已经为您生成供应商与工厂多维综合评分，详情如下：");
        }
        // 20.3) 智能派工
        if (containsAny(question, "派工", "派单")) {
            return handleDirectWidget("smart_assignment", "智能派工引擎已启动，为您提供最优人员计算：");
        }
        // 20.4) 待审批执行命令
        if (containsAny(question, "AI命令", "执行命令", "执行")) {
            return handleDirectWidget("execution", "已为您调取AI命令待审批与执行卡片：");
        }
        // 20.4b) 变更审批（路由到AI对话，由 tool_change_approval 处理）
        if (containsAny(question, "待审批", "审批")) {
            NlQueryResponse resp = new NlQueryResponse();
            resp.setIntent("ai_chat");
            resp.setAnswer("审批相关操作已集成到小云AI对话中 💬\n\n请在AI对话框中输入「帮我看看审批」，小云会为您列出待审批申请，并支持直接通过或驳回。");
            resp.setConfidence(90);
            return resp;
        }
        // 20.5) 财务/资金审核
        if (containsAny(question, "资金异常", "资金流向", "资金分析", "财务分析", "回款异常", "对账")) {
            return handleDirectWidget("finance_audit", "已经调出智能异常资金流向监控面板：");
        }

        // 21) 帮助
        if (containsAny(question, "帮助", "能做什么", "你会什么", "功能", "怎么用", "你好")) {
            return handleHelpQuery();
        }
        // 22) 总览/概况
        if (containsAny(question, "总览", "概况", "汇总", "情况", "怎么样", "报告", "整体")) {
            return handleSummaryQuery(tenantId);
        }

        // ── 智能底：调用 DeepSeek 处理无法匹配关键词的自由问题
        return handleAiDeepFallback(question, tenantId);
    }

    /**
     * 未命中关键词时的AI深度底底 —— 将系统实时数据作为上下文喜入DeepSeek
     */
    private NlQueryResponse handleAiDeepFallback(String question, Long tenantId) {
        NlQueryResponse ctx = handleSummaryQuery(tenantId);
        if (aiAdvisorService.isEnabled() && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            try {
                String ctxStr = buildBriefContext(ctx.getData(), ctx.getAnswer());
                String sys = "你是一位专业的服装供应链管理AI助手，服务于服装制造工厂。\n"
                        + "以下是系统当前实时业务数据（JSON格式）：\n" + ctxStr + "\n"
                        + "业务背景：订单生产流程为 采购面料→裁剪→车缝→尾部整理→质检→入库，"
                        + "涉及多家外协工厂、多名工人，按工序计件发放工资。\n"
                        + "回答要求：用中文简洁回答，不超过150字，优先引用上方数据中的具体数字，"
                        + "末尾若有合适建议可补充1条操作建议。";
                String aiAnswer = aiAdvisorService.chat(sys, question);
                if (aiAnswer != null && !aiAnswer.isBlank()) {
                    NlQueryResponse r = new NlQueryResponse();
                    r.setIntent("ai_direct");
                    r.setAnswer(aiAnswer);
                    r.setConfidence(88);
                    r.setData(ctx.getData());
                    r.setAiInsight(aiAnswer);
                    r.setSuggestions(ctx.getSuggestions());
                    return r;
                }
            } catch (Exception e) {
                log.warn("[NlQuery] AI底底失败，降级: {}", e.getMessage());
            }
        }
        ctx.setConfidence(40);
        ctx.setIntent("fallback");
        ctx.setAnswer("您的问题暂时没有直接匹配，以下是系统当前概况：\n" + ctx.getAnswer());
        return ctx;
    }

    /** 将业务数据压缩为短文本，作为DeepSeek的上下文 */
    private String buildBriefContext(Map<String, Object> data, String summaryAnswer) {
        if (data == null || data.isEmpty()) return summaryAnswer != null ? summaryAnswer : "（暂无数据）";
        StringBuilder sb = new StringBuilder();
        data.forEach((k, v) -> sb.append(k).append(": ").append(v).append("，"));
        return sb.toString();
    }

    // ── 订单查询 ──
    private NlQueryResponse handleOrderQuery(String question, Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("order_query");

        var matcher = ORDER_NO_PATTERN.matcher(question);
        if (matcher.find()) {
            String orderNo = matcher.group();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq("order_no", orderNo).eq("delete_flag", 0);
            ProductionOrder order = productionOrderService.getOne(qw, false);
            if (order != null) {
                int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
                int completed = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
                int total = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
                String statusCn = translateStatus(order.getStatus());
                String factory = order.getFactoryName() != null ? order.getFactoryName() : "未指定";

                StringBuilder sb = new StringBuilder();
                sb.append(String.format("📋 订单 %s\n", orderNo));
                sb.append(String.format("• 状态：%s\n", statusCn));
                sb.append(String.format("• 生产进度：%d%%（%d/%d 件）\n", progress, completed, total));
                sb.append(String.format("• 加工厂：%s\n", factory));
                if (order.getPlannedEndDate() != null) {
                    long daysLeft = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
                    sb.append(String.format("• 交期：%s（%s）",
                            order.getPlannedEndDate().toLocalDate(),
                            daysLeft > 0 ? "剩余" + daysLeft + "天" : "已逾期" + Math.abs(daysLeft) + "天"));
                }
                resp.setAnswer(sb.toString().trim());
                resp.setConfidence(95);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("orderNo", orderNo);
                data.put("status", order.getStatus());
                data.put("progress", progress);
                data.put("completed", completed);
                data.put("total", total);
                data.put("factory", factory);
                resp.setData(data);
            } else {
                resp.setAnswer(String.format("未找到订单 %s，请确认订单号是否正确", orderNo));
                resp.setConfidence(80);
            }
        } else {
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq("delete_flag", 0).ne("status", "completed");
            long inProgress = productionOrderService.count(qw);
            resp.setAnswer(String.format("当前有 %d 个进行中订单。请提供具体订单号（如PO20260301001）以查看详情。", inProgress));
            resp.setConfidence(70);
        }
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "今日扫码数量是多少？", "整体情况怎么样？"));
        return resp;
    }

    // ── 延期查询 ──
    private NlQueryResponse handleOverdueQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("overdue");
        long count = dashboardQueryService.countOverdueOrders();

        if (count == 0) {
            resp.setAnswer("🎉 当前没有延期订单，生产进度良好！");
            resp.setConfidence(95);
        } else {
            List<ProductionOrder> overdues = dashboardQueryService.listOverdueOrders(5);
            StringBuilder sb = new StringBuilder(String.format("⚠️ 当前共有 %d 个延期订单", count));
            if (!overdues.isEmpty()) {
                sb.append("，最紧急的几个：\n");
                for (ProductionOrder o : overdues) {
                    long days = o.getPlannedEndDate() != null
                            ? ChronoUnit.DAYS.between(o.getPlannedEndDate(), LocalDateTime.now()) : 0;
                    sb.append(String.format("• %s — 已延期 %d 天，进度 %d%%，工厂：%s\n",
                            o.getOrderNo(), days,
                            o.getProductionProgress() != null ? o.getProductionProgress() : 0,
                            o.getFactoryName() != null ? o.getFactoryName() : "未指定"));
                }
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("overdueCount", (int) count);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("今日产量如何？", "哪个工厂延期最多？", "整体情况怎么样？"));
        return resp;
    }

    // ── 对比/趋势查询 ──
    private NlQueryResponse handleCompareQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("compare");

        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(today, LocalTime.MAX);
        LocalDateTime yesterdayStart = LocalDateTime.of(today.minusDays(1), LocalTime.MIN);
        LocalDateTime yesterdayEnd = LocalDateTime.of(today.minusDays(1), LocalTime.MAX);

        long todayScan = dashboardQueryService.countScansBetween(todayStart, todayEnd);
        long todayQty = dashboardQueryService.sumTodayScanQuantity();
        long yesterdayScans = dashboardQueryService.countScansBetween(yesterdayStart, yesterdayEnd);

        // 入库对比
        long todayWarehouse = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);
        long yesterdayWarehouse = dashboardQueryService.countWarehousingBetween(yesterdayStart, yesterdayEnd);

        StringBuilder sb = new StringBuilder("📊 今日 vs 昨日对比：\n");
        sb.append(String.format("• 扫码次数：今日 %d 次 vs 昨日 %d 次（%s）\n",
                todayScan, yesterdayScans, formatDelta(todayScan, yesterdayScans)));
        sb.append(String.format("• 今日扫码件数：%d 件\n", todayQty));
        sb.append(String.format("• 入库单数：今日 %d 单 vs 昨日 %d 单（%s）",
                todayWarehouse, yesterdayWarehouse, formatDelta(todayWarehouse, yesterdayWarehouse)));

        resp.setAnswer(sb.toString());
        resp.setConfidence(90);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayScans", todayScan);
        data.put("yesterdayScans", yesterdayScans);
        data.put("todayScanQty", todayQty);
        data.put("todayWarehouse", todayWarehouse);
        data.put("yesterdayWarehouse", yesterdayWarehouse);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("这周产量怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    // ── 产量查询 ──
    private NlQueryResponse handleProductionQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("production");

        long todayScan = dashboardQueryService.sumTodayScanQuantity();

        // 同时获取当前活跃信息
        LocalDateTime thirtyMinAgo = LocalDateTime.now().minusMinutes(30);
        long activeWorkers = 0;
        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq(tenantId != null, "tenant_id", tenantId)
               .eq("scan_result", "success")
               .ge("scan_time", thirtyMinAgo)
               .select("DISTINCT operator_id");
            activeWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
        } catch (Exception ignore) { /* 降级跳过 */ }

        StringBuilder sb = new StringBuilder(String.format("📦 今日累计扫码 %d 件\n", todayScan));
        if (activeWorkers > 0) {
            sb.append(String.format("• 最近30分钟活跃工人：%d 人\n", activeWorkers));
        }
        if (todayScan > 0) {
            int hour = LocalDateTime.now().getHour();
            if (hour > 0) {
                sb.append(String.format("• 平均每小时：%.0f 件", (double) todayScan / hour));
            }
        }

        resp.setAnswer(sb.toString().trim());
        resp.setConfidence(90);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayScanQty", todayScan);
        data.put("activeWorkers", activeWorkers);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("和昨天比怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    // ── 质检查询 ──
    private NlQueryResponse handleQualityQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("quality");

        long qualified = dashboardQueryService.sumTotalQualifiedQuantity();
        long unqualified = dashboardQueryService.sumTotalUnqualifiedQuantity();
        long total = qualified + unqualified;

        if (total > 0) {
            double rate = Math.round(qualified * 1000.0 / total) / 10.0;
            resp.setAnswer(String.format("📊 质检数据：\n• 合格率：%.1f%%\n• 合格：%d 件 / 不合格：%d 件\n• 累计质检：%d 件",
                    rate, qualified, unqualified, total));
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("qualifiedRate", rate);
            data.put("qualified", qualified);
            data.put("unqualified", unqualified);
            resp.setData(data);
        } else {
            resp.setAnswer("暂无质检数据记录");
            resp.setConfidence(70);
        }
        resp.setSuggestions(Arrays.asList("今日产量多少？", "有延期订单吗？", "整体情况怎么样？"));
        return resp;
    }

    // ── 工厂/产能/员工查询已委托给 NlQuerySmartHandlers ──

    // ── 入库查询 ──
    private NlQueryResponse handleWarehousingQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("warehousing");

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayCount = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);
        long totalCount = dashboardQueryService.countTotalWarehousing();

        resp.setAnswer(String.format("📦 入库数据：\n• 今日入库：%d 单\n• 历史累计入库：%d 单", todayCount, totalCount));
        resp.setConfidence(85);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayWarehousing", todayCount);
        data.put("totalWarehousing", totalCount);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("今日产量多少？", "有延期订单吗？", "和昨天比怎么样？"));
        return resp;
    }

    // ── 裁剪查询 ──
    private NlQueryResponse handleCuttingQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("cutting");

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayCutting = dashboardQueryService.sumCuttingQuantityBetween(todayStart, todayEnd);

        resp.setAnswer(String.format("✂️ 今日裁剪数量：%d 件", todayCutting));
        resp.setConfidence(85);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayCutting", todayCutting);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("今日产量多少？", "入库情况如何？", "整体情况怎么样？"));
        return resp;
    }

    // ── 成本/利润查询已委托给 NlQuerySmartHandlers ──

    // ── 帮助/功能介绍（22 项全覆盖） ──
    private NlQueryResponse handleDirectWidget(String intent, String message) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent(intent);
        resp.setAnswer(message);
        resp.setConfidence(95);
        return resp;
    }

    private NlQueryResponse handleHelpQuery() {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("help");
        resp.setAnswer("👋 我是AI决策助手，支持 22 类问题，覆盖全系统：\n\n"
                + "📋 订单 & 进度：\n"
                + "• 「订单PO20260301001进度如何？」\n"
                + "• 「有多少延期订单？」「当前在制订单？」\n\n"
                + "📦 产量 & 扫码：\n"
                + "• 「今天扫码多少件？」「和昨天比怎么样？」\n"
                + "• 「今日裁剪数量？」「入库情况如何？」\n\n"
                + "🏭 工厂 & 产能：\n"
                + "• 「哪个工厂最忙？」「工厂排名如何？」\n"
                + "• 「产能负荷怎么样？」「实时脉搏？」\n\n"
                + "👷 人员 & 效率：\n"
                + "• 「谁的产量最高？」「员工效率排名？」\n\n"
                + "🔍 智能分析（12项黑科技）：\n"
                + "• 「系统健康指数？」  — 综合评分\n"
                + "• 「有瓶颈吗？」      — 瓶颈检测\n"
                + "• 「交期风险？」       — 延期预警\n"
                + "• 「有异常吗？」       — 异常行为告警\n"
                + "• 「质量缺陷分布？」   — 缺陷热力图\n"
                + "• 「生产节拍如何？」   — 节拍DNA分析\n"
                + "• 「成本利润？」       — 利润预估\n"
                + "• 「排程建议？」       — 智能排产\n"
                + "• 「有通知吗？」       — 智能通知\n"
                + "• 「系统自检？」       — 健康诊断\n"
                + "• 「学习报告？」       — 模型置信度\n\n"
                + "📊 综合：「整体情况怎么样？」「质检通过率？」");
        resp.setConfidence(100);
        resp.setSuggestions(Arrays.asList("系统健康指数？", "整体情况怎么样？", "有瓶颈吗？", "今日产量多少？"));
        return resp;
    }

    // ── 全景概要（也作为智能兜底，含健康指数） ──
    private NlQueryResponse handleSummaryQuery(Long tenantId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("summary");

        // 订单概况
        QueryWrapper<ProductionOrder> ipQw = new QueryWrapper<>();
        ipQw.eq(tenantId != null, "tenant_id", tenantId)
            .eq("delete_flag", 0).ne("status", "completed");
        long inProgress = productionOrderService.count(ipQw);
        long overdue = dashboardQueryService.countOverdueOrders();
        long todayScan = dashboardQueryService.sumTodayScanQuantity();

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayWarehouse = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);

        StringBuilder sb = new StringBuilder("📊 生产全景概要：\n");

        // 补充健康指数（来自 SmartHandlers）
        String healthLine = smartHandlers.getHealthSummaryLine();
        if (healthLine != null) {
            sb.append(healthLine).append("\n");
        }

        sb.append(String.format("• 在制订单：%d 个\n", inProgress));
        sb.append(String.format("• 延期订单：%d 个%s\n", overdue, overdue == 0 ? " ✅" : " ⚠️"));
        sb.append(String.format("• 今日扫码：%d 件\n", todayScan));
        sb.append(String.format("• 今日入库：%d 单\n", todayWarehouse));

        // 活跃工人
        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq(tenantId != null, "tenant_id", tenantId)
               .eq("scan_result", "success")
               .ge("scan_time", LocalDateTime.now().minusMinutes(60))
               .select("DISTINCT operator_id");
            long recentWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
            if (recentWorkers > 0) {
                sb.append(String.format("• 最近1小时活跃工人：%d 人", recentWorkers));
            }
        } catch (Exception ignore) { /* 降级跳过 */ }

        resp.setAnswer(sb.toString().trim());
        resp.setConfidence(85);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("inProgress", inProgress);
        data.put("overdue", overdue);
        data.put("todayScanQty", todayScan);
        data.put("todayWarehousing", todayWarehouse);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "和昨天比怎么样？", "哪个工厂最忙？", "谁的产量最高？"));
        return resp;
    }

    // ── 工具方法 ──

    private boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw)) return true;
        }
        return false;
    }

    private String translateStatus(String status) {
        if (status == null) return "未知";
        switch (status.toUpperCase()) {
            case "DRAFT": return "草稿";
            case "IN_PROGRESS": return "生产中";
            case "COMPLETED": return "已完工";
            case "CLOSED": return "已关闭";
            case "PENDING": return "待审核";
            default: return status;
        }
    }

    private String formatDelta(long current, long previous) {
        if (previous == 0) return current > 0 ? "↑ 新增" : "持平";
        long diff = current - previous;
        double pct = Math.round(diff * 1000.0 / previous) / 10.0;
        if (diff > 0) return String.format("↑%.1f%%", pct);
        if (diff < 0) return String.format("↓%.1f%%", Math.abs(pct));
        return "持平";
    }

    // ── LLM 意图分类 ──

    private static final List<String> KNOWN_INTENTS = Arrays.asList(
            "order_query", "overdue", "compare", "health", "bottleneck", "risk", "anomaly",
            "production", "defect", "quality", "factory_ranking", "pulse", "worker_efficiency",
            "warehousing", "cutting", "cost", "rhythm", "scheduling", "notification",
            "self_healing", "learning", "quote", "supplier_scorecard", "smart_assignment",
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
            + "quote - 报价/估价/定价\n"
            + "supplier_scorecard - 供应商评分/供应商排名\n"
            + "smart_assignment - 智能派工/排班/分配\n"
            + "execution - 执行/命令/操作\n"
            + "finance_audit - 财务/资金/对账\n"
            + "help - 帮助/功能/你能做什么\n"
            + "summary - 总览/概况/汇总/整体情况\n";

    /** 调用 DeepSeek 进行意图分类，失败返回 null */
    private String classifyIntentByLlm(String question, Long tenantId) {
        try {
            if (!aiAdvisorService.isEnabled()) return null;
            String reply = aiAdvisorService.chat(LLM_INTENT_PROMPT, "用户问题：" + question);
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
    private NlQueryResponse dispatchByIntent(String intent, String question, Long tenantId) {
        switch (intent) {
            case "order_query":       return handleOrderQuery(question, tenantId);
            case "overdue":           return handleOverdueQuery(tenantId);
            case "compare":           return handleCompareQuery(tenantId);
            case "health":            return smartHandlers.handleHealthQuery();
            case "bottleneck":        return smartHandlers.handleBottleneckQuery();
            case "risk":              return smartHandlers.handleRiskQuery();
            case "anomaly":           return smartHandlers.handleAnomalyQuery();
            case "production":        return handleProductionQuery(tenantId);
            case "defect":            return smartHandlers.handleDefectQuery();
            case "quality":           return handleQualityQuery(tenantId);
            case "factory_ranking":   return smartHandlers.handleFactoryRankingQuery();
            case "pulse":             return smartHandlers.handlePulseQuery();
            case "worker_efficiency": return smartHandlers.handleWorkerEfficiencyQuery();
            case "warehousing":       return handleWarehousingQuery(tenantId);
            case "cutting":           return handleCuttingQuery(tenantId);
            case "cost":              return smartHandlers.handleCostQuery();
            case "rhythm":            return handleDirectWidget("rhythm_dna", "已经打开节奏DNA分析面板：");
            case "scheduling":        return handleDirectWidget("scheduling", "已经打开智能排期面板：");
            case "notification":      return handleDirectWidget("mind_push", "已经打开智能推送通知面板：");
            case "self_healing":      return handleDirectWidget("self_healing", "已经打开自动修复面板：");
            case "learning":          return handleDirectWidget("learning", "已经打开学习报告面板：");
            case "quote":             return handleDirectWidget("style_quote", "已经打开智能报价面板：");
            case "supplier_scorecard":return handleDirectWidget("supplier_scorecard", "已经打开供应商评分卡面板：");
            case "smart_assignment":  return handleDirectWidget("smart_assignment", "已经打开智能派工面板：");
            case "execution":         return handleDirectWidget("execution", "已经打开执行引擎面板：");
            case "finance_audit":     return handleDirectWidget("finance_audit", "已经调出智能异常资金流向监控面板：");
            case "help":              return handleHelpQuery();
            case "summary":           return handleSummaryQuery(tenantId);
            default:                  return null;
        }
    }
}
