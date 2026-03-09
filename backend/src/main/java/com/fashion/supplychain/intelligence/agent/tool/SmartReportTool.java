package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 智能报表生成工具 — 日报/周报/月报数据引擎
 * 自动聚合扫码趋势、产能变化、工厂效率对比、逾期风险变化、成本统计
 */
@Slf4j
@Component
public class SmartReportTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;

    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_smart_report";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> reportType = new LinkedHashMap<>();
        reportType.put("type", "string");
        reportType.put("description", "报表类型：daily(日报), weekly(周报), monthly(月报)");
        properties.put("reportType", reportType);

        Map<String, Object> dateProp = new LinkedHashMap<>();
        dateProp.put("type", "string");
        dateProp.put("description", "报表日期(yyyy-MM-dd)，日报=该天，周报=该周所在日期，月报=该月所在日期。默认今天");
        properties.put("date", dateProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("生成智能运营报表（日报/周报/月报）。" +
                "包含：扫码产量统计、订单状态变化、工厂效率排名、逾期风险清单、成本汇总、" +
                "环比对比（日报对比昨日、周报对比上周、月报对比上月）。" +
                "当用户说'生成日报'、'出一份周报'、'月度总结'时调用此工具。");

        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("reportType"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = mapper.readValue(argumentsJson, new TypeReference<>() {});
        }

        String reportType = (String) args.getOrDefault("reportType", "daily");
        String dateStr = (String) args.get("date");
        LocalDate baseDate = dateStr != null ? LocalDate.parse(dateStr) : LocalDate.now();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", reportType);
        report.put("generatedAt", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        // 计算当期与对比期时间范围
        LocalDateTime periodStart, periodEnd, prevStart, prevEnd;
        switch (reportType) {
            case "weekly":
                LocalDate monday = baseDate.minusDays(baseDate.getDayOfWeek().getValue() - 1);
                periodStart = LocalDateTime.of(monday, LocalTime.MIN);
                periodEnd = LocalDateTime.of(monday.plusDays(6), LocalTime.MAX);
                prevStart = periodStart.minusWeeks(1);
                prevEnd = periodEnd.minusWeeks(1);
                report.put("period", monday + " ~ " + monday.plusDays(6));
                break;
            case "monthly":
                LocalDate monthFirst = baseDate.withDayOfMonth(1);
                periodStart = LocalDateTime.of(monthFirst, LocalTime.MIN);
                periodEnd = LocalDateTime.of(monthFirst.plusMonths(1).minusDays(1), LocalTime.MAX);
                prevStart = periodStart.minusMonths(1);
                prevEnd = periodEnd.minusMonths(1);
                report.put("period", monthFirst + " ~ " + monthFirst.plusMonths(1).minusDays(1));
                break;
            default: // daily
                periodStart = LocalDateTime.of(baseDate, LocalTime.MIN);
                periodEnd = LocalDateTime.of(baseDate, LocalTime.MAX);
                prevStart = periodStart.minusDays(1);
                prevEnd = periodEnd.minusDays(1);
                report.put("period", baseDate.toString());
        }

        // 1. 扫码产量统计 + 环比
        report.put("scanStats", buildScanStats(tenantId, periodStart, periodEnd, prevStart, prevEnd));

        // 2. 订单状态变化
        report.put("orderStats", buildOrderStats(tenantId, periodStart, periodEnd, prevStart, prevEnd));

        // 3. 工厂效率排名（本期扫码量 Top5）
        report.put("factoryRanking", buildFactoryRanking(tenantId, periodStart, periodEnd));

        // 4. 逾期与风险
        report.put("riskSummary", buildRiskSummary(tenantId));

        // 5. 成本汇总
        report.put("costSummary", buildCostSummary(tenantId, periodStart, periodEnd));

        return mapper.writeValueAsString(report);
    }

    private Map<String, Object> buildScanStats(Long tenantId, LocalDateTime start, LocalDateTime end,
                                                LocalDateTime prevStart, LocalDateTime prevEnd) {
        Map<String, Object> stats = new LinkedHashMap<>();

        long currentScanCount = countScans(tenantId, start, end);
        long prevScanCount = countScans(tenantId, prevStart, prevEnd);
        long currentScanQty = sumScanQuantity(tenantId, start, end);
        long prevScanQty = sumScanQuantity(tenantId, prevStart, prevEnd);

        stats.put("scanCount", currentScanCount);
        stats.put("scanQuantity", currentScanQty);
        stats.put("prevScanCount", prevScanCount);
        stats.put("prevScanQuantity", prevScanQty);
        stats.put("scanCountChange", calcChangePercent(currentScanCount, prevScanCount));
        stats.put("scanQtyChange", calcChangePercent(currentScanQty, prevScanQty));

        // 按扫码类型分布
        Map<String, Long> byType = new LinkedHashMap<>();
        for (String type : new String[]{"production", "quality", "warehouse"}) {
            QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
            q.eq("scan_type", type).ge("scan_time", start).le("scan_time", end);
            byType.put(type, scanRecordService.count(q));
        }
        stats.put("byType", byType);

        return stats;
    }

    private Map<String, Object> buildOrderStats(Long tenantId, LocalDateTime start, LocalDateTime end,
                                                 LocalDateTime prevStart, LocalDateTime prevEnd) {
        Map<String, Object> stats = new LinkedHashMap<>();

        // 本期新建
        long newOrders = countOrders(tenantId, start, end, null);
        long prevNewOrders = countOrders(tenantId, prevStart, prevEnd, null);
        stats.put("newOrders", newOrders);
        stats.put("prevNewOrders", prevNewOrders);
        stats.put("newOrdersChange", calcChangePercent(newOrders, prevNewOrders));

        // 本期完成
        long completed = countOrdersByStatusUpdate(tenantId, start, end, "COMPLETED");
        stats.put("completedOrders", completed);

        // 当前各状态总量
        Map<String, Long> currentStatus = new LinkedHashMap<>();
        for (String s : new String[]{"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}) {
            QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
            q.eq("status", s);
            currentStatus.put(s, productionOrderService.count(q));
        }
        stats.put("currentStatusBreakdown", currentStatus);

        // 紧急订单数
        QueryWrapper<ProductionOrder> urgentQ = baseOrderQuery(tenantId);
        urgentQ.eq("urgency_level", "urgent").ne("status", "COMPLETED").ne("status", "CANCELLED");
        stats.put("urgentOrderCount", productionOrderService.count(urgentQ));

        return stats;
    }

    private List<Map<String, Object>> buildFactoryRanking(Long tenantId, LocalDateTime start, LocalDateTime end) {
        // 查询本期所有成功扫码记录，按工厂分组统计
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end);
        q.isNotNull("factory_id");
        List<ScanRecord> scans = scanRecordService.list(q);

        // 按 factoryId 聚合
        Map<String, long[]> factoryMap = new LinkedHashMap<>(); // factoryId -> [count, qty]
        Map<String, String> factoryNames = new HashMap<>();

        for (ScanRecord scan : scans) {
            String fid = scan.getFactoryId();
            if (fid == null || fid.isBlank()) continue;
            factoryMap.computeIfAbsent(fid, k -> new long[2]);
            factoryMap.get(fid)[0]++;
            factoryMap.get(fid)[1] += scan.getQuantity() != null ? scan.getQuantity() : 0;
            // 尝试根据工厂ID查名字 —— 用订单的factoryName
        }

        // 通过订单获取工厂名
        if (!factoryMap.isEmpty()) {
            QueryWrapper<ProductionOrder> fq = baseOrderQuery(tenantId);
            fq.in("factory_id", factoryMap.keySet()).select("factory_id", "factory_name").groupBy("factory_id", "factory_name");
            List<ProductionOrder> factoryOrders = productionOrderService.list(fq);
            for (ProductionOrder fo : factoryOrders) {
                if (fo.getFactoryId() != null && fo.getFactoryName() != null) {
                    factoryNames.put(fo.getFactoryId(), fo.getFactoryName());
                }
            }
        }

        // 按扫码件数排序 Top5
        return factoryMap.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .limit(5)
                .map(e -> {
                    Map<String, Object> dto = new LinkedHashMap<>();
                    dto.put("factoryId", e.getKey());
                    dto.put("factoryName", factoryNames.getOrDefault(e.getKey(), "未知"));
                    dto.put("scanCount", e.getValue()[0]);
                    dto.put("scanQuantity", e.getValue()[1]);
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private Map<String, Object> buildRiskSummary(Long tenantId) {
        Map<String, Object> risk = new LinkedHashMap<>();

        // 逾期未完成
        QueryWrapper<ProductionOrder> overdueQ = baseOrderQuery(tenantId);
        overdueQ.ne("status", "COMPLETED").ne("status", "CANCELLED")
                .isNotNull("planned_end_date").lt("planned_end_date", LocalDateTime.now());
        List<ProductionOrder> overdue = productionOrderService.list(overdueQ);
        risk.put("overdueCount", overdue.size());

        List<Map<String, Object>> overdueTop = overdue.stream()
                .limit(5).map(this::orderBrief).collect(Collectors.toList());
        risk.put("overdueTop5", overdueTop);

        // 7天内到期 进度<50%
        QueryWrapper<ProductionOrder> highRiskQ = baseOrderQuery(tenantId);
        highRiskQ.eq("status", "IN_PROGRESS").isNotNull("planned_end_date")
                .le("planned_end_date", LocalDateTime.now().plusDays(7))
                .ge("planned_end_date", LocalDateTime.now());
        List<ProductionOrder> highRisk = productionOrderService.list(highRiskQ).stream()
                .filter(o -> o.getProductionProgress() == null || o.getProductionProgress() < 50)
                .toList();
        risk.put("highRiskCount", highRisk.size());
        risk.put("highRiskTop5", highRisk.stream().limit(5).map(this::orderBrief).collect(Collectors.toList()));

        // 停滞订单（进行中但进度=0）
        QueryWrapper<ProductionOrder> stagnantQ = baseOrderQuery(tenantId);
        stagnantQ.eq("status", "IN_PROGRESS")
                .and(w -> w.isNull("production_progress").or().eq("production_progress", 0));
        long stagnantCount = productionOrderService.count(stagnantQ);
        risk.put("stagnantCount", stagnantCount);

        return risk;
    }

    private Map<String, Object> buildCostSummary(Long tenantId, LocalDateTime start, LocalDateTime end) {
        Map<String, Object> cost = new LinkedHashMap<>();

        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end).isNotNull("scan_cost");
        List<ScanRecord> scans = scanRecordService.list(q);

        BigDecimal totalCost = scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        cost.put("totalScanCost", totalCost.setScale(2, RoundingMode.HALF_UP));
        cost.put("scanRecordCount", scans.size());

        // 按工序分组的成本
        Map<String, BigDecimal> costByProcess = scans.stream()
                .filter(s -> s.getProgressStage() != null)
                .collect(Collectors.groupingBy(ScanRecord::getProgressStage,
                        Collectors.reducing(BigDecimal.ZERO,
                                s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO,
                                BigDecimal::add)));
        Map<String, String> formatted = new LinkedHashMap<>();
        costByProcess.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .forEach(e -> formatted.put(e.getKey(), e.getValue().setScale(2, RoundingMode.HALF_UP).toString()));
        cost.put("costByStage", formatted);

        return cost;
    }

    // ---- 辅助方法 ----
    private long countScans(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end);
        return scanRecordService.count(q);
    }

    private long sumScanQuantity(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end);
        List<ScanRecord> list = scanRecordService.list(q);
        return list.stream().mapToLong(s -> s.getQuantity() != null ? s.getQuantity() : 0).sum();
    }

    private long countOrders(Long tenantId, LocalDateTime start, LocalDateTime end, String status) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ge("create_time", start).le("create_time", end);
        if (status != null) q.eq("status", status);
        return productionOrderService.count(q);
    }

    private long countOrdersByStatusUpdate(Long tenantId, LocalDateTime start, LocalDateTime end, String status) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.eq("status", status).ge("update_time", start).le("update_time", end);
        return productionOrderService.count(q);
    }

    private QueryWrapper<ScanRecord> baseScanQuery(Long tenantId) {
        QueryWrapper<ScanRecord> q = new QueryWrapper<>();
        q.eq("scan_result", "success");
        if (tenantId != null) q.eq("tenant_id", tenantId);
        return q;
    }

    private QueryWrapper<ProductionOrder> baseOrderQuery(Long tenantId) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("delete_flag", 0);
        if (tenantId != null) q.eq("tenant_id", tenantId);
        return q;
    }

    private String calcChangePercent(long current, long prev) {
        if (prev == 0) return current > 0 ? "+∞" : "0%";
        double change = ((double) (current - prev) / prev) * 100;
        return (change >= 0 ? "+" : "") + String.format("%.1f%%", change);
    }

    private Map<String, Object> orderBrief(ProductionOrder o) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("orderNo", o.getOrderNo());
        dto.put("styleName", o.getStyleName());
        dto.put("factoryName", o.getFactoryName());
        dto.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
        dto.put("deadline", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : "未设置");
        dto.put("company", o.getCompany());
        dto.put("merchandiser", o.getMerchandiser());
        return dto;
    }
}
