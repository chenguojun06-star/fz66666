package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.report.ReportDataCollector;
import com.fashion.supplychain.intelligence.orchestration.report.ReportFormatHelper;
import com.fashion.supplychain.intelligence.orchestration.report.ReportStyleKit;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ProfessionalReportOrchestrator {

    @Autowired
    private ReportDataCollector dataCollector;

    public byte[] generateReport(String reportType, LocalDate baseDate) {
        ReportDataCollector.ReportContext ctx = dataCollector.resolveContext(reportType, baseDate);
        String scopeLabel = ctx.isManager() ? "全局数据（所有订单）" :
                "个人数据（跟单员：" + (ctx.scopeUsername() != null ? ctx.scopeUsername() : ctx.scopeUserId()) + "）";

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            ReportStyleKit kit = new ReportStyleKit(wb);

            buildCoverSheet(wb, kit, reportType, ctx.range(), scopeLabel);
            buildKpiSheet(wb, kit, ctx);
            buildFactorySheet(wb, kit, ctx);
            buildRiskSheet(wb, kit, ctx);
            buildCostSheet(wb, kit, ctx);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("[ProfessionalReport] 报告生成失败", e);
            throw new RuntimeException("报告生成失败: " + e.getMessage());
        }
    }

    public Map<String, Object> generateReportSummary(String reportType, LocalDate baseDate) {
        ReportDataCollector.ReportContext ctx = dataCollector.resolveContext(reportType, baseDate);
        ReportFormatHelper.TimeRange range = ctx.range();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reportType", reportType);
        result.put("typeLabel", "daily".equals(reportType) ? "日报" : "weekly".equals(reportType) ? "周报" : "月报");
        result.put("rangeLabel", range.label());
        result.put("baseDate", ctx.baseDate().format(ReportFormatHelper.DATE_FMT));
        result.put("scope", ctx.isManager() ? "全局数据" : "个人数据（" + (ctx.scopeUsername() != null ? ctx.scopeUsername() : "本人") + "）");

        result.put("kpis", buildSummaryKpis(ctx));
        result.put("scanTypes", buildSummaryScanTypes(ctx));
        result.put("orderStatus", buildSummaryOrderStatus(ctx));
        result.put("factoryRanking", buildSummaryFactoryRanking(ctx));
        result.put("riskSummary", buildSummaryRisk(ctx));
        result.put("costSummary", buildSummaryCost(ctx));

        return result;
    }

    private void buildCoverSheet(XSSFWorkbook wb, ReportStyleKit kit, String reportType,
                                  ReportFormatHelper.TimeRange range, String scopeLabel) {
        Sheet sheet = wb.createSheet("报告封面");
        sheet.setColumnWidth(0, 15000);
        sheet.setDefaultRowHeight((short) 500);

        int row = 2;
        Row r = sheet.createRow(row);
        Cell c = r.createCell(0);
        c.setCellValue("云裳智链 · 供应链管理系统");
        c.setCellStyle(kit.titleStyle);
        r.setHeight((short) 900);

        row += 2;
        r = sheet.createRow(row);
        c = r.createCell(0);
        String typeLabel = "daily".equals(reportType) ? "日报" : "weekly".equals(reportType) ? "周报" : "月报";
        c.setCellValue("生产运营" + typeLabel);
        c.setCellStyle(kit.subtitleStyle);
        r.setHeight((short) 700);

        row += 2;
        String[][] info = {
                {"报告周期", range.label()},
                {"生成时间", LocalDateTime.now().format(ReportFormatHelper.DATETIME_FMT)},
                {"报告人", UserContext.username() != null ? UserContext.username() : "系统自动生成"},
                {"数据范围", scopeLabel},
                {"数据来源", "云裳智链生产管理系统（实时数据）"},
                {"密级", "内部资料 · 仅供管理层参阅"}
        };
        for (String[] pair : info) {
            r = sheet.createRow(row++);
            c = r.createCell(0);
            c.setCellValue(pair[0] + "：" + pair[1]);
            c.setCellStyle(kit.infoStyle);
        }
    }

    private void buildKpiSheet(XSSFWorkbook wb, ReportStyleKit kit, ReportDataCollector.ReportContext ctx) {
        Sheet sheet = wb.createSheet("核心KPI");
        sheet.setColumnWidth(0, 8000);
        sheet.setColumnWidth(1, 5000);
        sheet.setColumnWidth(2, 5000);
        sheet.setColumnWidth(3, 5000);

        int rowIdx = 0;
        ReportFormatHelper.TimeRange range = ctx.range();

        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("一、核心经营指标概览");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 3));
        r.setHeight((short) 600);

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        String[] kpiHeaders = {"指标", "本期", "上期", "环比变化"};
        for (int i = 0; i < kpiHeaders.length; i++) {
            c = r.createCell(i);
            c.setCellValue(kpiHeaders[i]);
            c.setCellStyle(kit.headerStyle);
        }

        long curScanCount = dataCollector.countScans(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.factoryId());
        long prevScanCount = dataCollector.countScans(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.factoryId());
        long curScanQty = dataCollector.sumScanQty(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.factoryId());
        long prevScanQty = dataCollector.sumScanQty(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.factoryId());
        long curNewOrders = dataCollector.countNewOrders(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long prevNewOrders = dataCollector.countNewOrders(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long curCompleted = dataCollector.countCompletedOrders(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());

        String[][] kpiData = {
                {"扫码次数", String.valueOf(curScanCount), String.valueOf(prevScanCount), ReportFormatHelper.changeStr(curScanCount, prevScanCount)},
                {"扫码件数", String.valueOf(curScanQty), String.valueOf(prevScanQty), ReportFormatHelper.changeStr(curScanQty, prevScanQty)},
                {"新建订单数", String.valueOf(curNewOrders), String.valueOf(prevNewOrders), ReportFormatHelper.changeStr(curNewOrders, prevNewOrders)},
                {"完成订单数", String.valueOf(curCompleted), "-", "-"},
        };

        for (String[] data : kpiData) {
            r = sheet.createRow(rowIdx++);
            for (int i = 0; i < data.length; i++) {
                c = r.createCell(i);
                c.setCellValue(data[i]);
                c.setCellStyle(i == 0 ? kit.labelStyle : kit.dataStyle);
            }
        }

        rowIdx = appendScanTypeDistribution(sheet, kit, ctx, rowIdx);
        rowIdx = appendOrderStatusDistribution(sheet, kit, ctx, rowIdx);
    }

    private int appendScanTypeDistribution(Sheet sheet, ReportStyleKit kit, ReportDataCollector.ReportContext ctx, int rowIdx) {
        ReportFormatHelper.TimeRange range = ctx.range();
        rowIdx += 2;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("二、扫码类型分布");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx - 1, rowIdx - 1, 0, 3));

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        String[] typeHeaders = {"扫码类型", "本期次数", "占比", ""};
        for (int i = 0; i < typeHeaders.length; i++) {
            c = r.createCell(i);
            c.setCellValue(typeHeaders[i]);
            c.setCellStyle(kit.headerStyle);
        }

        Map<String, Long> byType = new LinkedHashMap<>();
        for (String type : new String[]{"production", "quality", "warehouse"}) {
            byType.put(type, dataCollector.countScansByType(ctx.tenantId(), range.start(), range.end(), type, ctx.scopeUserId(), ctx.factoryId()));
        }
        long totalByType = byType.values().stream().mapToLong(Long::longValue).sum();
        Map<String, String> typeLabels = Map.of("production", "生产扫码", "quality", "质检扫码", "warehouse", "入库扫码");

        for (Map.Entry<String, Long> entry : byType.entrySet()) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(typeLabels.getOrDefault(entry.getKey(), entry.getKey()));
            r.createCell(1).setCellValue(entry.getValue());
            String pct = totalByType > 0 ? String.format("%.1f%%", entry.getValue() * 100.0 / totalByType) : "0%";
            r.createCell(2).setCellValue(pct);
            for (int i = 0; i < 3; i++) {
                r.getCell(i).setCellStyle(i == 0 ? kit.labelStyle : kit.dataStyle);
            }
        }
        return rowIdx;
    }

    private int appendOrderStatusDistribution(Sheet sheet, ReportStyleKit kit, ReportDataCollector.ReportContext ctx, int rowIdx) {
        rowIdx += 2;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("三、订单状态分布（当前）");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx - 1, rowIdx - 1, 0, 3));

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        String[] headers = {"状态", "数量", "", ""};
        for (int i = 0; i < headers.length; i++) {
            c = r.createCell(i);
            c.setCellValue(headers[i]);
            c.setCellStyle(kit.headerStyle);
        }

        Map<String, String> statusLabels = new LinkedHashMap<>();
        statusLabels.put("PENDING", "待开始");
        statusLabels.put("IN_PROGRESS", "进行中");
        statusLabels.put("COMPLETED", "已完成");
        statusLabels.put("CANCELLED", "已取消");

        for (Map.Entry<String, String> entry : statusLabels.entrySet()) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(entry.getValue());
            r.getCell(0).setCellStyle(kit.labelStyle);
            long cnt = dataCollector.countOrdersByStatus(ctx.tenantId(), entry.getKey(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
            c = r.createCell(1);
            c.setCellValue(cnt);
            c.setCellStyle(kit.dataStyle);
        }
        return rowIdx;
    }

    private void buildFactorySheet(XSSFWorkbook wb, ReportStyleKit kit, ReportDataCollector.ReportContext ctx) {
        Sheet sheet = wb.createSheet("工厂效率排名");
        sheet.setColumnWidth(0, 3000);
        sheet.setColumnWidth(1, 8000);
        sheet.setColumnWidth(2, 5000);
        sheet.setColumnWidth(3, 6000);

        int rowIdx = 0;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("工厂产能排名（按扫码件数）");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 3));
        r.setHeight((short) 600);

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        String[] headers = {"排名", "工厂名称", "扫码次数", "扫码件数"};
        for (int i = 0; i < headers.length; i++) {
            c = r.createCell(i);
            c.setCellValue(headers[i]);
            c.setCellStyle(kit.headerStyle);
        }

        List<ReportFormatHelper.FactoryRank> rankings = dataCollector.buildFactoryRankings(
                ctx.tenantId(), ctx.range().start(), ctx.range().end(),
                ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        int rank = 1;
        for (ReportFormatHelper.FactoryRank fr : rankings) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(rank++);
            r.createCell(1).setCellValue(fr.name());
            r.createCell(2).setCellValue(fr.scanCount());
            r.createCell(3).setCellValue(fr.scanQty());
            for (int i = 0; i < 4; i++) {
                r.getCell(i).setCellStyle(i <= 1 ? kit.labelStyle : kit.dataStyle);
            }
        }

        if (rankings.isEmpty()) {
            r = sheet.createRow(rowIdx);
            c = r.createCell(0);
            c.setCellValue("本期暂无工厂扫码数据");
            c.setCellStyle(kit.infoStyle);
            sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 3));
        }
    }

    private void buildRiskSheet(XSSFWorkbook wb, ReportStyleKit kit, ReportDataCollector.ReportContext ctx) {
        Sheet sheet = wb.createSheet("风险预警");
        sheet.setColumnWidth(0, 5000);
        sheet.setColumnWidth(1, 5000);
        sheet.setColumnWidth(2, 6000);
        sheet.setColumnWidth(3, 4000);
        sheet.setColumnWidth(4, 4000);
        sheet.setColumnWidth(5, 5000);

        int rowIdx = 0;

        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("风险概览");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 5));
        r.setHeight((short) 600);
        rowIdx++;

        List<ProductionOrder> overdue = dataCollector.getOverdueOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        List<ProductionOrder> highRisk = dataCollector.getHighRiskOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long stagnant = dataCollector.countStagnantOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());

        r = sheet.createRow(rowIdx++);
        r.createCell(0).setCellValue("指标");
        r.createCell(1).setCellValue("数量");
        r.getCell(0).setCellStyle(kit.headerStyle);
        r.getCell(1).setCellStyle(kit.headerStyle);

        String[][] summary = {
                {"已逾期订单（红色预警）", String.valueOf(overdue.size())},
                {"高风险订单（7天内到期且进度<50%）", String.valueOf(highRisk.size())},
                {"停滞订单（进行中但进度为0）", String.valueOf(stagnant)},
        };
        for (String[] row : summary) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(row[0]);
            r.createCell(1).setCellValue(row[1]);
            r.getCell(0).setCellStyle(kit.labelStyle);
            r.getCell(1).setCellStyle(kit.warnStyle);
        }

        rowIdx = appendOrderDetailTable(sheet, kit, overdue, "逾期订单明细（Top 10）", rowIdx);
        rowIdx = appendOrderDetailTable(sheet, kit, highRisk, "高风险订单明细（7天内到期，进度<50%）", rowIdx);
    }

    private int appendOrderDetailTable(Sheet sheet, ReportStyleKit kit, List<ProductionOrder> orders,
                                        String title, int rowIdx) {
        if (orders.isEmpty()) return rowIdx;

        rowIdx += 2;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue(title);
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx - 1, rowIdx - 1, 0, 5));
        rowIdx++;

        r = sheet.createRow(rowIdx++);
        String[] riskHeaders = {"订单号", "款式", "工厂", "数量", "进度", "交期"};
        for (int i = 0; i < riskHeaders.length; i++) {
            r.createCell(i).setCellValue(riskHeaders[i]);
            r.getCell(i).setCellStyle(kit.headerStyle);
        }

        for (ProductionOrder o : orders.stream().limit(10).toList()) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(ReportFormatHelper.nullSafe(o.getOrderNo()));
            r.createCell(1).setCellValue(ReportFormatHelper.nullSafe(o.getStyleName()));
            r.createCell(2).setCellValue(ReportFormatHelper.nullSafe(o.getFactoryName()));
            r.createCell(3).setCellValue(o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
            r.createCell(4).setCellValue((o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
            r.createCell(5).setCellValue(o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().format(ReportFormatHelper.DATE_FMT) : "未设置");
            for (int i = 0; i < 6; i++) r.getCell(i).setCellStyle(kit.dataStyle);
        }
        return rowIdx;
    }

    private void buildCostSheet(XSSFWorkbook wb, ReportStyleKit kit, ReportDataCollector.ReportContext ctx) {
        Sheet sheet = wb.createSheet("成本分析");
        sheet.setColumnWidth(0, 8000);
        sheet.setColumnWidth(1, 6000);
        sheet.setColumnWidth(2, 5000);

        int rowIdx = 0;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("本期成本汇总");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 2));
        r.setHeight((short) 600);

        rowIdx++;
        List<ScanRecord> scans = dataCollector.getScansInRange(
                ctx.tenantId(), ctx.range().start(), ctx.range().end(), ctx.scopeUserId(), ctx.factoryId());
        BigDecimal totalCost = dataCollector.sumScanCost(scans);

        r = sheet.createRow(rowIdx++);
        r.createCell(0).setCellValue("总加工成本（元）");
        r.createCell(1).setCellValue(totalCost.setScale(2, RoundingMode.HALF_UP).toString());
        r.getCell(0).setCellStyle(kit.labelStyle);
        r.getCell(1).setCellStyle(kit.dataStyle);

        r = sheet.createRow(rowIdx++);
        r.createCell(0).setCellValue("涉及扫码记录数");
        r.createCell(1).setCellValue(scans.size());
        r.getCell(0).setCellStyle(kit.labelStyle);
        r.getCell(1).setCellStyle(kit.dataStyle);

        rowIdx = appendCostByStage(sheet, kit, scans, totalCost, rowIdx);
    }

    private int appendCostByStage(Sheet sheet, ReportStyleKit kit, List<ScanRecord> scans,
                                   BigDecimal totalCost, int rowIdx) {
        rowIdx += 2;
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("按工序阶段分布");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx - 1, rowIdx - 1, 0, 2));

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        r.createCell(0).setCellValue("工序阶段");
        r.createCell(1).setCellValue("成本（元）");
        r.createCell(2).setCellValue("占比");
        for (int i = 0; i < 3; i++) r.getCell(i).setCellStyle(kit.headerStyle);

        Map<String, BigDecimal> costByStage = scans.stream()
                .filter(s -> s.getProgressStage() != null)
                .collect(Collectors.groupingBy(ScanRecord::getProgressStage,
                        Collectors.reducing(BigDecimal.ZERO,
                                s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO,
                                BigDecimal::add)));

        costByStage.entrySet().stream()
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .forEach(e -> {
                    Row row = sheet.createRow(sheet.getLastRowNum() + 1);
                    row.createCell(0).setCellValue(e.getKey());
                    row.createCell(1).setCellValue(e.getValue().setScale(2, RoundingMode.HALF_UP).toString());
                    String pct = totalCost.compareTo(BigDecimal.ZERO) > 0
                            ? e.getValue().multiply(BigDecimal.valueOf(100)).divide(totalCost, 1, RoundingMode.HALF_UP) + "%"
                            : "0%";
                    row.createCell(2).setCellValue(pct);
                    for (int i = 0; i < 3; i++) row.getCell(i).setCellStyle(kit.dataStyle);
                });
        return rowIdx;
    }

    private List<Map<String, Object>> buildSummaryKpis(ReportDataCollector.ReportContext ctx) {
        ReportFormatHelper.TimeRange range = ctx.range();
        long curScanCount = dataCollector.countScans(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.factoryId());
        long prevScanCount = dataCollector.countScans(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.factoryId());
        long curScanQty = dataCollector.sumScanQty(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.factoryId());
        long prevScanQty = dataCollector.sumScanQty(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.factoryId());
        long curNewOrders = dataCollector.countNewOrders(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long prevNewOrders = dataCollector.countNewOrders(ctx.tenantId(), range.prevStart(), range.prevEnd(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long curCompleted = dataCollector.countCompletedOrders(ctx.tenantId(), range.start(), range.end(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());

        List<Map<String, Object>> kpis = new ArrayList<>();
        kpis.add(ReportFormatHelper.buildKpi("扫码次数", curScanCount, prevScanCount, "次"));
        kpis.add(ReportFormatHelper.buildKpi("扫码件数", curScanQty, prevScanQty, "件"));
        kpis.add(ReportFormatHelper.buildKpi("新建订单", curNewOrders, prevNewOrders, "张"));
        kpis.add(ReportFormatHelper.buildKpi("完成订单", curCompleted, -1, "张"));
        return kpis;
    }

    private List<Map<String, Object>> buildSummaryScanTypes(ReportDataCollector.ReportContext ctx) {
        ReportFormatHelper.TimeRange range = ctx.range();
        List<Map<String, Object>> scanTypes = new ArrayList<>();
        long totalByType = 0;
        Map<String, Long> typeCounts = new LinkedHashMap<>();
        Map<String, String> typeLabels = Map.of("production", "生产扫码", "quality", "质检扫码", "warehouse", "入库扫码");
        for (String type : new String[]{"production", "quality", "warehouse"}) {
            long cnt = dataCollector.countScansByType(ctx.tenantId(), range.start(), range.end(), type, ctx.scopeUserId(), ctx.factoryId());
            typeCounts.put(type, cnt);
            totalByType += cnt;
        }
        for (Map.Entry<String, Long> e : typeCounts.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", typeLabels.getOrDefault(e.getKey(), e.getKey()));
            item.put("count", e.getValue());
            item.put("percent", totalByType > 0 ? Math.round(e.getValue() * 1000.0 / totalByType) / 10.0 : 0.0);
            scanTypes.add(item);
        }
        return scanTypes;
    }

    private List<Map<String, Object>> buildSummaryOrderStatus(ReportDataCollector.ReportContext ctx) {
        Map<String, String> statusLabels = new LinkedHashMap<>();
        statusLabels.put("PENDING", "待开始");
        statusLabels.put("IN_PROGRESS", "进行中");
        statusLabels.put("COMPLETED", "已完成");
        statusLabels.put("CANCELLED", "已取消");
        List<Map<String, Object>> statusList = new ArrayList<>();
        for (Map.Entry<String, String> e : statusLabels.entrySet()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", e.getValue());
            item.put("count", dataCollector.countOrdersByStatus(ctx.tenantId(), e.getKey(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId()));
            statusList.add(item);
        }
        return statusList;
    }

    private List<Map<String, Object>> buildSummaryFactoryRanking(ReportDataCollector.ReportContext ctx) {
        List<ReportFormatHelper.FactoryRank> rankings = dataCollector.buildFactoryRankings(
                ctx.tenantId(), ctx.range().start(), ctx.range().end(),
                ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        List<Map<String, Object>> factoryList = new ArrayList<>();
        int rank = 1;
        for (ReportFormatHelper.FactoryRank fr : rankings.stream().limit(5).toList()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("rank", rank++);
            item.put("name", fr.name());
            item.put("scanCount", fr.scanCount());
            item.put("scanQty", fr.scanQty());
            factoryList.add(item);
        }
        return factoryList;
    }

    private Map<String, Object> buildSummaryRisk(ReportDataCollector.ReportContext ctx) {
        List<ProductionOrder> overdue = dataCollector.getOverdueOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        List<ProductionOrder> highRisk = dataCollector.getHighRiskOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());
        long stagnant = dataCollector.countStagnantOrders(ctx.tenantId(), ctx.scopeUserId(), ctx.scopeUsername(), ctx.factoryId());

        Map<String, Object> riskSummary = new LinkedHashMap<>();
        riskSummary.put("overdueCount", overdue.size());
        riskSummary.put("highRiskCount", highRisk.size());
        riskSummary.put("stagnantCount", stagnant);

        riskSummary.put("overdueOrders", overdue.stream().limit(5).map(o ->
                ReportFormatHelper.orderToMap(o, o.getOrderNo(), o.getStyleNo(),
                        o.getStatus(), o.getFactoryName())).toList());
        riskSummary.put("highRiskOrders", highRisk.stream().limit(5).map(o ->
                ReportFormatHelper.orderToMap(o, o.getOrderNo(), o.getStyleNo(),
                        o.getStatus(), o.getFactoryName())).toList());

        return riskSummary;
    }

    private Map<String, Object> buildSummaryCost(ReportDataCollector.ReportContext ctx) {
        List<ScanRecord> scans = dataCollector.getScansInRange(
                ctx.tenantId(), ctx.range().start(), ctx.range().end(), ctx.scopeUserId(), ctx.factoryId());
        BigDecimal totalCost = dataCollector.sumScanCost(scans);
        Map<String, Object> costSummary = new LinkedHashMap<>();
        costSummary.put("totalCost", totalCost.setScale(2, RoundingMode.HALF_UP).toString());
        costSummary.put("scanCount", scans.size());
        return costSummary;
    }
}
