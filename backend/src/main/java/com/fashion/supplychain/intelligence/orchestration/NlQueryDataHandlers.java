package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
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
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * NL 查询数据处理器 — 从 NlQueryOrchestrator 抽取的数据查询方法
 *
 * 职责：执行具体的数据查询和格式化，包括：
 *   订单查询、逾期查询、对比/趋势、产量、质检、入库、裁剪、概要、帮助、AI兜底
 */
@Component
@Slf4j
public class NlQueryDataHandlers {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private DashboardQueryService dashboardQueryService;
    @Autowired private AiAdvisorService aiAdvisorService;
    @Autowired private NlQuerySmartHandlers smartHandlers;

    static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{8,}");

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    // ── 订单查询 ──

    public NlQueryResponse handleOrderQuery(String question, Long tenantId, String factoryId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("order_query");

        var matcher = ORDER_NO_PATTERN.matcher(question);
        if (matcher.find()) {
            String orderNo = matcher.group();
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
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
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
              .eq("delete_flag", 0).notIn("status", TERMINAL_STATUSES);
            long inProgress = productionOrderService.count(qw);
            resp.setAnswer(String.format("当前有 %d 个进行中订单。请提供具体订单号（如PO20260301001）以查看详情。", inProgress));
            resp.setConfidence(70);
        }
        tryAddAiInsight(resp, tenantId, factoryId);
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "今日扫码数量是多少？", "整体情况怎么样？"));
        return resp;
    }

    // ── 延期查询 ──

    public NlQueryResponse handleOverdueQuery(Long tenantId, String factoryId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("overdue");
        long count = dashboardQueryService.countOverdueOrders();

        if (count == 0) {
            resp.setAnswer("🎉 当前没有延期订单，生产进度良好！");
            resp.setConfidence(95);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("overdueCount", 0);
            data.put("factoryGroups", Collections.emptyList());
            resp.setData(data);
        } else {
            List<ProductionOrder> allOverdues = dashboardQueryService.listOverdueOrders(200);
            LocalDateTime now = LocalDateTime.now();

            Map<String, List<ProductionOrder>> byFactory = allOverdues.stream()
                    .collect(Collectors.groupingBy(
                            o -> o.getFactoryName() != null ? o.getFactoryName() : "未指定",
                            LinkedHashMap::new, Collectors.toList()));

            List<Map<String, Object>> factoryGroups = new ArrayList<>();
            int totalQuantity = 0;
            int totalProgress = 0;
            int totalOverdueDays = 0;

            for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
                String fName = entry.getKey();
                List<ProductionOrder> orders = entry.getValue();
                int fOrderCount = orders.size();
                int fTotalQty = orders.stream().mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
                int fAvgProgress = (int) orders.stream().mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0).average().orElse(0);
                int fAvgOverdueDays = (int) orders.stream().mapToInt(o -> {
                    if (o.getPlannedEndDate() != null) return (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
                    return 0;
                }).average().orElse(0);

                long fActiveWorkers = 0;
                try {
                    Set<String> factoryIds = orders.stream()
                            .map(ProductionOrder::getFactoryId)
                            .filter(Objects::nonNull)
                            .collect(Collectors.toSet());
                    if (!factoryIds.isEmpty()) {
                        QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
                        aqw.eq(tenantId != null, "tenant_id", tenantId)
                           .in("factory_id", factoryIds)
                           .eq("scan_result", "success")
                           .ge("scan_time", now.minusDays(30))
                           .select("DISTINCT operator_id");
                        fActiveWorkers = scanRecordService.list(aqw).stream()
                                .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
                    }
                } catch (Exception e) {
                    log.warn("[智能问答] 查询工厂活跃工人失败: factory={}, error={}", fName, e.getMessage());
                }

                int fEstDays = fAvgProgress > 0 && fTotalQty > 0
                        ? (int) Math.ceil((100.0 - fAvgProgress) / Math.max(fAvgProgress, 1) * (fAvgOverdueDays > 0 ? fAvgOverdueDays : 7))
                        : -1;

                List<Map<String, Object>> orderItems = orders.stream().map(o -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("orderNo", o.getOrderNo());
                    item.put("styleNo", o.getStyleNo());
                    item.put("progress", o.getProductionProgress() != null ? o.getProductionProgress() : 0);
                    item.put("overdueDays", o.getPlannedEndDate() != null ? (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now) : 0);
                    item.put("quantity", o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                    item.put("plannedEndDate", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : null);
                    return item;
                }).collect(Collectors.toList());

                Map<String, Object> group = new LinkedHashMap<>();
                group.put("factoryName", fName);
                group.put("totalOrders", fOrderCount);
                group.put("totalQuantity", fTotalQty);
                group.put("avgProgress", fAvgProgress);
                group.put("avgOverdueDays", fAvgOverdueDays);
                group.put("activeWorkers", fActiveWorkers);
                group.put("estimatedCompletionDays", fEstDays);
                group.put("orders", orderItems);
                factoryGroups.add(group);

                totalQuantity += fTotalQty;
                totalProgress += orders.stream().mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0).sum();
                totalOverdueDays += orders.stream().mapToInt(o -> {
                    if (o.getPlannedEndDate() != null) return (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now);
                    return 0;
                }).sum();
            }

            int overallAvgProgress = count > 0 ? totalProgress / (int) count : 0;
            int overallAvgOverdueDays = count > 0 ? totalOverdueDays / (int) count : 0;

            StringBuilder sb = new StringBuilder(String.format("⚠️ 当前共有 %d 个延期订单，涉及 %d 家工厂", count, byFactory.size()));
            sb.append(String.format("，总件数 %d，平均进度 %d%%，平均延期 %d 天", totalQuantity, overallAvgProgress, overallAvgOverdueDays));

            try {
                String factoryGroupsJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(factoryGroups);
                sb.append("\n【OVERDUE_FACTORY】").append(factoryGroupsJson).append("【/OVERDUE_FACTORY】");
            } catch (Exception e) {
                log.warn("[智能问答] 序列化工厂分组数据失败: {}", e.getMessage());
            }

            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("overdueCount", (int) count);
            data.put("totalQuantity", totalQuantity);
            data.put("avgProgress", overallAvgProgress);
            data.put("avgOverdueDays", overallAvgOverdueDays);
            data.put("factoryGroupCount", byFactory.size());
            data.put("factoryGroups", factoryGroups);
            resp.setData(data);
        }
        tryAddAiInsight(resp, tenantId, factoryId);
        resp.setSuggestions(Arrays.asList("今日产量如何？", "哪个工厂延期最多？", "整体情况怎么样？"));
        return resp;
    }

    // ── 对比/趋势查询 ──

    public NlQueryResponse handleCompareQuery(Long tenantId, String factoryId) {
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
        tryAddAiInsight(resp, tenantId, factoryId);
        resp.setSuggestions(Arrays.asList("这周产量怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    // ── 产量查询 ──

    public NlQueryResponse handleProductionQuery(Long tenantId, String factoryId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("production");

        long todayScan = dashboardQueryService.sumTodayScanQuantity();
        LocalDateTime thirtyMinAgo = LocalDateTime.now().minusMinutes(30);
        long activeWorkers = 0;
        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq(tenantId != null, "tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .eq("scan_result", "success")
               .ge("scan_time", thirtyMinAgo)
               .select("DISTINCT operator_id");
            activeWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
        } catch (Exception e) {
            log.warn("[智能问答] 查询活跃工人数量失败: tenantId={}, error={}", tenantId, e.getMessage());
        }

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
        tryAddAiInsight(resp, tenantId, factoryId);
        resp.setSuggestions(Arrays.asList("和昨天比怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    // ── 质检查询 ──

    public NlQueryResponse handleQualityQuery(Long tenantId, String factoryId) {
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
        tryAddAiInsight(resp, tenantId, factoryId);
        resp.setSuggestions(Arrays.asList("今日产量多少？", "有延期订单吗？", "整体情况怎么样？"));
        return resp;
    }

    // ── 入库查询 ──

    public NlQueryResponse handleWarehousingQuery(Long tenantId, String factoryId) {
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

    public NlQueryResponse handleCuttingQuery(Long tenantId, String factoryId) {
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

    // ── 帮助 ──

    public NlQueryResponse handleHelpQuery() {
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
                + "• 「有通知吗？」       — 智能通知\n"
                + "• 「系统自检？」       — 健康诊断\n"
                + "• 「学习报告？」       — 模型置信度\n\n"
                + "📊 综合：「整体情况怎么样？」「质检通过率？」");
        resp.setConfidence(100);
        resp.setSuggestions(Arrays.asList("系统健康指数？", "整体情况怎么样？", "有瓶颈吗？", "今日产量多少？"));
        return resp;
    }

    // ── 全景概要 ──

    public NlQueryResponse handleSummaryQuery(Long tenantId, String factoryId) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("summary");

        QueryWrapper<ProductionOrder> ipQw = new QueryWrapper<>();
        ipQw.eq(tenantId != null, "tenant_id", tenantId)
            .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
            .eq("delete_flag", 0).notIn("status", TERMINAL_STATUSES);
        long inProgress = productionOrderService.count(ipQw);
        long overdue = dashboardQueryService.countOverdueOrders();
        long todayScan = dashboardQueryService.sumTodayScanQuantity();

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayWarehouse = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);

        StringBuilder sb = new StringBuilder("📊 生产全景概要：\n");

        String healthLine = smartHandlers.getHealthSummaryLine();
        if (healthLine != null) {
            sb.append(healthLine).append("\n");
        }

        sb.append(String.format("• 在制订单：%d 个\n", inProgress));
        sb.append(String.format("• 延期订单：%d 个%s\n", overdue, overdue == 0 ? " ✅" : " ⚠️"));
        sb.append(String.format("• 今日扫码：%d 件\n", todayScan));
        sb.append(String.format("• 今日入库：%d 单\n", todayWarehouse));

        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq(tenantId != null, "tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .eq("scan_result", "success")
               .ge("scan_time", LocalDateTime.now().minusMinutes(60))
               .select("DISTINCT operator_id");
            long recentWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
            if (recentWorkers > 0) {
                sb.append(String.format("• 最近1小时活跃工人：%d 人", recentWorkers));
            }
        } catch (Exception e) {
            log.warn("[智能问答] 查询最近1小时活跃工人失败: tenantId={}, error={}", tenantId, e.getMessage());
        }

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

    // ── AI 深度兜底 ──

    public NlQueryResponse handleAiDeepFallback(String question, Long tenantId, String factoryId) {
        NlQueryResponse ctx = handleSummaryQuery(tenantId, factoryId);
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
                log.warn("[NlQuery] AI兜底失败，降级: {}", e.getMessage());
            }
        }
        ctx.setConfidence(40);
        ctx.setIntent("fallback");
        ctx.setAnswer("您的问题暂时没有直接匹配，以下是系统当前概况：\n" + ctx.getAnswer());
        return ctx;
    }

    // ── 工具方法 ──

    void tryAddAiInsight(NlQueryResponse resp, Long tenantId, String factoryId) {
        if (resp.getAiInsight() != null) return;
        if (!aiAdvisorService.isEnabled() || !aiAdvisorService.checkAndConsumeQuota(tenantId)) return;
        try {
            String sys = "你是服装供应链分析师。根据以下业务数据，用1句话（不超过50字）指出最关键的风险或建议。直接给出结论，不要引言。";
            String insight = aiAdvisorService.chat(sys, "当前业务数据：\n" + resp.getAnswer());
            if (insight != null && !insight.isBlank()) {
                resp.setAiInsight(insight.length() > 80 ? insight.substring(0, 80) : insight);
            }
        } catch (Exception e) {
            log.debug("[NlQuery-insight] AI洞察生成失败（非阻断）: {}", e.getMessage());
        }
    }

    private String buildBriefContext(Map<String, Object> data, String summaryAnswer) {
        if (data == null || data.isEmpty()) return summaryAnswer != null ? summaryAnswer : "（暂无数据）";
        StringBuilder sb = new StringBuilder();
        data.forEach((k, v) -> sb.append(k).append(": ").append(v).append("，"));
        return sb.toString();
    }

    String formatDelta(long current, long previous) {
        if (previous == 0) return current > 0 ? "↑ 新增" : "持平";
        long diff = current - previous;
        double pct = Math.round(diff * 1000.0 / previous) / 10.0;
        if (diff > 0) return String.format("↑%.1f%%", pct);
        if (diff < 0) return String.format("↓%.1f%%", Math.abs(pct));
        return "持平";
    }

    String translateStatus(String status) {
        if (status == null) return "未知";
        return switch (status.toUpperCase()) {
            case "DRAFT" -> "草稿";
            case "IN_PROGRESS" -> "生产中";
            case "COMPLETED" -> "已完工";
            case "CLOSED" -> "已关闭";
            case "PENDING" -> "待审核";
            default -> status;
        };
    }
}
