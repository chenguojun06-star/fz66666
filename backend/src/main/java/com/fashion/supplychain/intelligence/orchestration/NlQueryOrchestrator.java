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

    /** 意图识别路由（22 种意图，按优先级排列） */
    private NlQueryResponse routeIntent(String question, Long tenantId) {
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
        // 21) 帮助
        if (containsAny(question, "帮助", "能做什么", "你会什么", "功能", "怎么用", "你好")) {
            return handleHelpQuery();
        }
        // 22) 总览/概况
        if (containsAny(question, "总览", "概况", "汇总", "情况", "怎么样", "报告", "整体")) {
            return handleSummaryQuery(tenantId);
        }

        // ── 智能兜底：没命中任何关键词 → 给全景概要，但 confidence=40 标记「本地不确定」
        // Controller 检测到低置信度时会转发给 DeepSeek 做深度分析
        NlQueryResponse fallback = handleSummaryQuery(tenantId);
        fallback.setConfidence(40);
        fallback.setIntent("fallback");
        return fallback;
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
}
