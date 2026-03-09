package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 专业运营报告生成器 — 生成可直接用于管理层汇报的 Excel 报告
 * 支持日报/周报/月报，包含执行摘要、KPI、生产进度、工厂排名、风险清单、成本分析
 */
@Slf4j
@Service
public class ProfessionalReportOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /**
     * 生成专业报告 Excel 文件
     */
    public byte[] generateReport(String reportType, LocalDate baseDate) {
        Long tenantId = UserContext.tenantId();
        if (baseDate == null) baseDate = LocalDate.now();

        // 计算时间范围
        TimeRange range = calcTimeRange(reportType, baseDate);

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            StyleKit kit = new StyleKit(wb);

            buildCoverSheet(wb, kit, reportType, range);
            buildKpiSheet(wb, kit, tenantId, range);
            buildFactorySheet(wb, kit, tenantId, range);
            buildRiskSheet(wb, kit, tenantId);
            buildCostSheet(wb, kit, tenantId, range);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("[ProfessionalReport] 报告生成失败", e);
            throw new RuntimeException("报告生成失败: " + e.getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Sheet 1: 封面
    // ═══════════════════════════════════════════════════════════
    private void buildCoverSheet(XSSFWorkbook wb, StyleKit kit, String reportType, TimeRange range) {
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
                {"报告周期", range.label},
                {"生成时间", LocalDateTime.now().format(DATETIME_FMT)},
                {"报告人", UserContext.username() != null ? UserContext.username() : "系统自动生成"},
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

    // ═══════════════════════════════════════════════════════════
    //  Sheet 2: 核心 KPI 概览
    // ═══════════════════════════════════════════════════════════
    private void buildKpiSheet(XSSFWorkbook wb, StyleKit kit, Long tenantId, TimeRange range) {
        Sheet sheet = wb.createSheet("核心KPI");
        sheet.setColumnWidth(0, 8000);
        sheet.setColumnWidth(1, 5000);
        sheet.setColumnWidth(2, 5000);
        sheet.setColumnWidth(3, 5000);

        int rowIdx = 0;

        // 标题
        Row r = sheet.createRow(rowIdx++);
        Cell c = r.createCell(0);
        c.setCellValue("一、核心经营指标概览");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, 3));
        r.setHeight((short) 600);

        // 表头
        rowIdx++;
        r = sheet.createRow(rowIdx++);
        String[] kpiHeaders = {"指标", "本期", "上期", "环比变化"};
        for (int i = 0; i < kpiHeaders.length; i++) {
            c = r.createCell(i);
            c.setCellValue(kpiHeaders[i]);
            c.setCellStyle(kit.headerStyle);
        }

        // 数据
        long curScanCount = countScans(tenantId, range.start, range.end);
        long prevScanCount = countScans(tenantId, range.prevStart, range.prevEnd);
        long curScanQty = sumScanQty(tenantId, range.start, range.end);
        long prevScanQty = sumScanQty(tenantId, range.prevStart, range.prevEnd);
        long curNewOrders = countNewOrders(tenantId, range.start, range.end);
        long prevNewOrders = countNewOrders(tenantId, range.prevStart, range.prevEnd);
        long curCompleted = countCompletedOrders(tenantId, range.start, range.end);

        String[][] kpiData = {
                {"扫码次数", String.valueOf(curScanCount), String.valueOf(prevScanCount), changeStr(curScanCount, prevScanCount)},
                {"扫码件数", String.valueOf(curScanQty), String.valueOf(prevScanQty), changeStr(curScanQty, prevScanQty)},
                {"新建订单数", String.valueOf(curNewOrders), String.valueOf(prevNewOrders), changeStr(curNewOrders, prevNewOrders)},
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

        // 扫码类型分布小表
        rowIdx += 2;
        r = sheet.createRow(rowIdx++);
        c = r.createCell(0);
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
            byType.put(type, countScansByType(tenantId, range.start, range.end, type));
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

        // 订单状态分布
        rowIdx += 2;
        r = sheet.createRow(rowIdx++);
        c = r.createCell(0);
        c.setCellValue("三、订单状态分布（当前）");
        c.setCellStyle(kit.sectionStyle);
        sheet.addMergedRegion(new CellRangeAddress(rowIdx - 1, rowIdx - 1, 0, 3));

        rowIdx++;
        r = sheet.createRow(rowIdx++);
        for (int i = 0; i < new String[]{"状态", "数量", "", ""}.length; i++) {
            c = r.createCell(i);
            c.setCellValue(new String[]{"状态", "数量", "", ""}[i]);
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
            long cnt = countOrdersByStatus(tenantId, entry.getKey());
            c = r.createCell(1);
            c.setCellValue(cnt);
            c.setCellStyle(kit.dataStyle);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Sheet 3: 工厂效率排名
    // ═══════════════════════════════════════════════════════════
    private void buildFactorySheet(XSSFWorkbook wb, StyleKit kit, Long tenantId, TimeRange range) {
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

        List<FactoryRank> rankings = buildFactoryRankings(tenantId, range.start, range.end);
        int rank = 1;
        for (FactoryRank fr : rankings) {
            r = sheet.createRow(rowIdx++);
            r.createCell(0).setCellValue(rank++);
            r.createCell(1).setCellValue(fr.name);
            r.createCell(2).setCellValue(fr.scanCount);
            r.createCell(3).setCellValue(fr.scanQty);
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

    // ═══════════════════════════════════════════════════════════
    //  Sheet 4: 风险清单
    // ═══════════════════════════════════════════════════════════
    private void buildRiskSheet(XSSFWorkbook wb, StyleKit kit, Long tenantId) {
        Sheet sheet = wb.createSheet("风险预警");
        sheet.setColumnWidth(0, 5000);
        sheet.setColumnWidth(1, 5000);
        sheet.setColumnWidth(2, 6000);
        sheet.setColumnWidth(3, 4000);
        sheet.setColumnWidth(4, 4000);
        sheet.setColumnWidth(5, 5000);

        int rowIdx = 0;

        // 风险概览
        r(sheet, rowIdx, kit.sectionStyle, "风险概览");
        sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 5));
        sheet.getRow(rowIdx).setHeight((short) 600);
        rowIdx += 2;

        // 逾期订单
        List<ProductionOrder> overdue = getOverdueOrders(tenantId);
        List<ProductionOrder> highRisk = getHighRiskOrders(tenantId);
        long stagnant = countStagnantOrders(tenantId);

        Row r = sheet.createRow(rowIdx++);
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

        // 逾期订单明细
        if (!overdue.isEmpty()) {
            rowIdx += 2;
            r(sheet, rowIdx, kit.sectionStyle, "逾期订单明细（Top 10）");
            sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 5));
            rowIdx += 2;

            r = sheet.createRow(rowIdx++);
            String[] riskHeaders = {"订单号", "款式", "工厂", "数量", "进度", "交期"};
            for (int i = 0; i < riskHeaders.length; i++) {
                r.createCell(i).setCellValue(riskHeaders[i]);
                r.getCell(i).setCellStyle(kit.headerStyle);
            }

            for (ProductionOrder o : overdue.stream().limit(10).toList()) {
                r = sheet.createRow(rowIdx++);
                r.createCell(0).setCellValue(nullSafe(o.getOrderNo()));
                r.createCell(1).setCellValue(nullSafe(o.getStyleName()));
                r.createCell(2).setCellValue(nullSafe(o.getFactoryName()));
                r.createCell(3).setCellValue(o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                r.createCell(4).setCellValue((o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
                r.createCell(5).setCellValue(o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().format(DATE_FMT) : "未设置");
                for (int i = 0; i < 6; i++) r.getCell(i).setCellStyle(kit.dataStyle);
            }
        }

        // 高风险订单明细
        if (!highRisk.isEmpty()) {
            rowIdx += 2;
            r(sheet, rowIdx, kit.sectionStyle, "高风险订单明细（7天内到期，进度<50%）");
            sheet.addMergedRegion(new CellRangeAddress(rowIdx, rowIdx, 0, 5));
            rowIdx += 2;

            r = sheet.createRow(rowIdx++);
            String[] hrHeaders = {"订单号", "款式", "工厂", "数量", "进度", "交期"};
            for (int i = 0; i < hrHeaders.length; i++) {
                r.createCell(i).setCellValue(hrHeaders[i]);
                r.getCell(i).setCellStyle(kit.headerStyle);
            }

            for (ProductionOrder o : highRisk.stream().limit(10).toList()) {
                r = sheet.createRow(rowIdx++);
                r.createCell(0).setCellValue(nullSafe(o.getOrderNo()));
                r.createCell(1).setCellValue(nullSafe(o.getStyleName()));
                r.createCell(2).setCellValue(nullSafe(o.getFactoryName()));
                r.createCell(3).setCellValue(o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                r.createCell(4).setCellValue((o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
                r.createCell(5).setCellValue(o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().format(DATE_FMT) : "未设置");
                for (int i = 0; i < 6; i++) r.getCell(i).setCellStyle(kit.dataStyle);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Sheet 5: 成本分析
    // ═══════════════════════════════════════════════════════════
    private void buildCostSheet(XSSFWorkbook wb, StyleKit kit, Long tenantId, TimeRange range) {
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

        // 汇总
        rowIdx++;
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", range.start).le("scan_time", range.end).isNotNull("scan_cost");
        List<ScanRecord> scans = scanRecordService.list(q);

        BigDecimal totalCost = scans.stream()
                .map(s -> s.getScanCost() != null ? s.getScanCost() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

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

        // 按工序分组
        rowIdx += 2;
        r = sheet.createRow(rowIdx++);
        c = r.createCell(0);
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
    }

    // ═══════════════════════════════════════════════════════════
    //  数据查询辅助方法
    // ═══════════════════════════════════════════════════════════

    private long countScans(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end);
        return scanRecordService.count(q);
    }

    private long sumScanQty(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end);
        return scanRecordService.list(q).stream()
                .mapToLong(s -> s.getQuantity() != null ? s.getQuantity() : 0).sum();
    }

    private long countScansByType(Long tenantId, LocalDateTime start, LocalDateTime end, String type) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.eq("scan_type", type).ge("scan_time", start).le("scan_time", end);
        return scanRecordService.count(q);
    }

    private long countNewOrders(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ge("create_time", start).le("create_time", end);
        return productionOrderService.count(q);
    }

    private long countCompletedOrders(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.eq("status", "COMPLETED").ge("update_time", start).le("update_time", end);
        return productionOrderService.count(q);
    }

    private long countOrdersByStatus(Long tenantId, String status) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.eq("status", status);
        return productionOrderService.count(q);
    }

    private List<ProductionOrder> getOverdueOrders(Long tenantId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.ne("status", "COMPLETED").ne("status", "CANCELLED")
                .isNotNull("planned_end_date").lt("planned_end_date", LocalDateTime.now());
        return productionOrderService.list(q);
    }

    private List<ProductionOrder> getHighRiskOrders(Long tenantId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.eq("status", "IN_PROGRESS").isNotNull("planned_end_date")
                .le("planned_end_date", LocalDateTime.now().plusDays(7))
                .ge("planned_end_date", LocalDateTime.now());
        return productionOrderService.list(q).stream()
                .filter(o -> o.getProductionProgress() == null || o.getProductionProgress() < 50)
                .toList();
    }

    private long countStagnantOrders(Long tenantId) {
        QueryWrapper<ProductionOrder> q = baseOrderQuery(tenantId);
        q.eq("status", "IN_PROGRESS")
                .and(w -> w.isNull("production_progress").or().eq("production_progress", 0));
        return productionOrderService.count(q);
    }

    private List<FactoryRank> buildFactoryRankings(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> q = baseScanQuery(tenantId);
        q.ge("scan_time", start).le("scan_time", end).isNotNull("factory_id");
        List<ScanRecord> scans = scanRecordService.list(q);

        Map<String, long[]> factoryMap = new LinkedHashMap<>();
        for (ScanRecord scan : scans) {
            String fid = scan.getFactoryId();
            if (fid == null || fid.isBlank()) continue;
            factoryMap.computeIfAbsent(fid, k -> new long[2]);
            factoryMap.get(fid)[0]++;
            factoryMap.get(fid)[1] += scan.getQuantity() != null ? scan.getQuantity() : 0;
        }

        // 获取工厂名称
        Map<String, String> factoryNames = new HashMap<>();
        if (!factoryMap.isEmpty()) {
            QueryWrapper<ProductionOrder> fq = baseOrderQuery(tenantId);
            fq.in("factory_id", factoryMap.keySet()).select("factory_id", "factory_name").groupBy("factory_id", "factory_name");
            for (ProductionOrder fo : productionOrderService.list(fq)) {
                if (fo.getFactoryId() != null && fo.getFactoryName() != null) {
                    factoryNames.put(fo.getFactoryId(), fo.getFactoryName());
                }
            }
        }

        return factoryMap.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue()[1], a.getValue()[1]))
                .limit(10)
                .map(e -> new FactoryRank(
                        factoryNames.getOrDefault(e.getKey(), "未知"),
                        e.getValue()[0], e.getValue()[1]))
                .toList();
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

    // ═══════════════════════════════════════════════════════════
    //  工具方法
    // ═══════════════════════════════════════════════════════════

    private void r(Sheet sheet, int rowIdx, CellStyle style, String text) {
        Row row = sheet.createRow(rowIdx);
        Cell cell = row.createCell(0);
        cell.setCellValue(text);
        cell.setCellStyle(style);
        row.setHeight((short) 600);
    }

    private String changeStr(long cur, long prev) {
        if (prev == 0) return cur > 0 ? "+∞" : "持平";
        double pct = ((double) (cur - prev) / prev) * 100;
        return (pct >= 0 ? "+" : "") + String.format("%.1f%%", pct);
    }

    private String nullSafe(String s) {
        return s != null ? s : "";
    }

    private TimeRange calcTimeRange(String reportType, LocalDate baseDate) {
        LocalDateTime start, end, prevStart, prevEnd;
        String label;
        switch (reportType) {
            case "weekly":
                LocalDate monday = baseDate.minusDays(baseDate.getDayOfWeek().getValue() - 1);
                start = LocalDateTime.of(monday, LocalTime.MIN);
                end = LocalDateTime.of(monday.plusDays(6), LocalTime.MAX);
                prevStart = start.minusWeeks(1);
                prevEnd = end.minusWeeks(1);
                label = monday.format(DATE_FMT) + " ~ " + monday.plusDays(6).format(DATE_FMT);
                break;
            case "monthly":
                LocalDate first = baseDate.withDayOfMonth(1);
                start = LocalDateTime.of(first, LocalTime.MIN);
                end = LocalDateTime.of(first.plusMonths(1).minusDays(1), LocalTime.MAX);
                prevStart = start.minusMonths(1);
                prevEnd = end.minusMonths(1);
                label = first.format(DATE_FMT) + " ~ " + first.plusMonths(1).minusDays(1).format(DATE_FMT);
                break;
            default:
                start = LocalDateTime.of(baseDate, LocalTime.MIN);
                end = LocalDateTime.of(baseDate, LocalTime.MAX);
                prevStart = start.minusDays(1);
                prevEnd = end.minusDays(1);
                label = baseDate.format(DATE_FMT);
        }
        return new TimeRange(start, end, prevStart, prevEnd, label);
    }

    // ═══════════════════════════════════════════════════════════
    //  内部类
    // ═══════════════════════════════════════════════════════════

    private record TimeRange(LocalDateTime start, LocalDateTime end,
                             LocalDateTime prevStart, LocalDateTime prevEnd, String label) {}

    private record FactoryRank(String name, long scanCount, long scanQty) {}

    /**
     * Excel 样式工具箱 — 统一管理所有单元格样式
     */
    private static class StyleKit {
        final CellStyle titleStyle;
        final CellStyle subtitleStyle;
        final CellStyle sectionStyle;
        final CellStyle headerStyle;
        final CellStyle labelStyle;
        final CellStyle dataStyle;
        final CellStyle infoStyle;
        final CellStyle warnStyle;

        StyleKit(Workbook wb) {
            // 报告大标题
            titleStyle = wb.createCellStyle();
            Font titleFont = wb.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 22);
            titleFont.setColor(IndexedColors.DARK_BLUE.getIndex());
            titleStyle.setFont(titleFont);

            // 副标题
            subtitleStyle = wb.createCellStyle();
            Font subFont = wb.createFont();
            subFont.setBold(true);
            subFont.setFontHeightInPoints((short) 16);
            subFont.setColor(IndexedColors.GREY_80_PERCENT.getIndex());
            subtitleStyle.setFont(subFont);

            // 章节标题
            sectionStyle = wb.createCellStyle();
            Font secFont = wb.createFont();
            secFont.setBold(true);
            secFont.setFontHeightInPoints((short) 13);
            secFont.setColor(IndexedColors.DARK_BLUE.getIndex());
            sectionStyle.setFont(secFont);
            sectionStyle.setBorderBottom(BorderStyle.MEDIUM);
            sectionStyle.setBottomBorderColor(IndexedColors.DARK_BLUE.getIndex());

            // 表头
            headerStyle = wb.createCellStyle();
            Font headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setFontHeightInPoints((short) 11);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setBorderTop(BorderStyle.THIN);
            headerStyle.setBorderLeft(BorderStyle.THIN);
            headerStyle.setBorderRight(BorderStyle.THIN);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            // 标签列
            labelStyle = wb.createCellStyle();
            Font labelFont = wb.createFont();
            labelFont.setFontHeightInPoints((short) 11);
            labelStyle.setFont(labelFont);
            labelStyle.setBorderBottom(BorderStyle.THIN);
            labelStyle.setBorderTop(BorderStyle.THIN);
            labelStyle.setBorderLeft(BorderStyle.THIN);
            labelStyle.setBorderRight(BorderStyle.THIN);
            labelStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            labelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // 数据列
            dataStyle = wb.createCellStyle();
            Font dataFont = wb.createFont();
            dataFont.setFontHeightInPoints((short) 11);
            dataStyle.setFont(dataFont);
            dataStyle.setBorderBottom(BorderStyle.THIN);
            dataStyle.setBorderTop(BorderStyle.THIN);
            dataStyle.setBorderLeft(BorderStyle.THIN);
            dataStyle.setBorderRight(BorderStyle.THIN);
            dataStyle.setAlignment(HorizontalAlignment.CENTER);

            // 信息文本
            infoStyle = wb.createCellStyle();
            Font infoFont = wb.createFont();
            infoFont.setFontHeightInPoints((short) 11);
            infoFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            infoStyle.setFont(infoFont);

            // 警告值
            warnStyle = wb.createCellStyle();
            Font warnFont = wb.createFont();
            warnFont.setBold(true);
            warnFont.setFontHeightInPoints((short) 12);
            warnFont.setColor(IndexedColors.RED.getIndex());
            warnStyle.setFont(warnFont);
            warnStyle.setBorderBottom(BorderStyle.THIN);
            warnStyle.setBorderTop(BorderStyle.THIN);
            warnStyle.setBorderLeft(BorderStyle.THIN);
            warnStyle.setBorderRight(BorderStyle.THIN);
            warnStyle.setAlignment(HorizontalAlignment.CENTER);
        }
    }
}
