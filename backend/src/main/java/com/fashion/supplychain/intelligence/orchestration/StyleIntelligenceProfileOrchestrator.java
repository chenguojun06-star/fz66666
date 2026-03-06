package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.FinanceSummary;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.ProductionSummary;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.ScanSummary;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.StageStatus;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.StockSummary;
import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.TenantPreferenceProfile;
import com.fashion.supplychain.intelligence.dto.StyleQuoteSuggestionResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.service.SampleStockService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.intelligence.service.IntelligenceReasonLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class StyleIntelligenceProfileOrchestrator {

    private static final DateTimeFormatter DATE_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private StyleQuoteSuggestionOrchestrator styleQuoteSuggestionOrchestrator;

    @Autowired
    private TenantIntelligenceProfileViewOrchestrator tenantIntelligenceProfileViewOrchestrator;

    @Autowired
    private IntelligenceReasonLibraryService intelligenceReasonLibraryService;

    public StyleIntelligenceProfileResponse profile(Long styleId, String styleNo) {
        StyleIntelligenceProfileResponse response = new StyleIntelligenceProfileResponse();
        StyleInfo style = findStyle(styleId, styleNo);
        if (style == null) {
            response.getInsights().add("未找到对应款式，无法生成智能档案。");
            return response;
        }

        List<ProductionOrder> orders = loadOrders(style.getStyleNo());
        List<ScanRecord> scanRecords = loadScanRecords(style.getStyleNo());
        TenantPreferenceProfile tenantProfile = tenantIntelligenceProfileViewOrchestrator.getCurrentTenantPreferenceProfile();
        response.setTenantProfile(tenantProfile);

        fillBaseInfo(response, style, tenantProfile);
        fillProductionSummary(response.getProduction(), orders, tenantProfile);
        fillScanSummary(response.getScan(), scanRecords, tenantProfile);

        List<SampleStock> sampleStocks = loadSampleStocks(style.getStyleNo());
        fillStockSummary(response.getStock(), sampleStocks);

        StyleQuoteSuggestionResponse quoteSuggestion = styleQuoteSuggestionOrchestrator.suggest(style.getStyleNo());
        StyleQuotation quotation = style.getId() == null ? null : styleQuotationService.getByStyleId(style.getId());
        fillFinanceSummary(response.getFinance(), quotation, quoteSuggestion, orders);

        response.setStages(buildStages(style));
        response.setInsights(buildInsights(style, response, quoteSuggestion));
        return response;
    }

    private StyleInfo findStyle(Long styleId, String styleNo) {
        if (styleId != null) {
            return styleInfoService.getDetailById(styleId);
        }
        String normalized = styleNo == null ? "" : styleNo.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<StyleInfo> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(StyleInfo::getTenantId, tenantId);
        }
        qw.eq(StyleInfo::getStyleNo, normalized).last("LIMIT 1");
        return styleInfoService.getOne(qw, false);
    }

    private void fillBaseInfo(StyleIntelligenceProfileResponse response, StyleInfo style, TenantPreferenceProfile tenantProfile) {
        response.setStyleId(style.getId());
        response.setStyleNo(style.getStyleNo());
        response.setStyleName(style.getStyleName());
        response.setCategory(style.getCategory());
        response.setProgressNode(style.getProgressNode());
        if (style.getDeliveryDate() != null) {
            response.setDeliveryDate(style.getDeliveryDate().format(DATE_FMT));
            int days = (int) ChronoUnit.DAYS.between(LocalDate.now(), style.getDeliveryDate().toLocalDate());
            response.setDaysToDelivery(days);
            int warningDays = tenantProfile != null && tenantProfile.getDeliveryWarningDays() != null ? tenantProfile.getDeliveryWarningDays() : 3;
            response.setDeliveryRisk(days < 0 ? "OVERDUE" : days <= warningDays ? "WARNING" : "SAFE");
        } else {
            response.setDeliveryRisk("UNKNOWN");
        }

        int done = 0;
        if (style.getBomCompletedTime() != null) done++;
        if ("COMPLETED".equalsIgnoreCase(style.getPatternStatus())) done++;
        if (style.getSizeCompletedTime() != null) done++;
        if (style.getProductionCompletedTime() != null) done++;
        if (style.getSecondaryCompletedTime() != null) done++;
        if (style.getProcessCompletedTime() != null) done++;
        if (style.getSizePriceCompletedTime() != null) done++;
        int rate = (int) Math.round(done * 100.0 / 7.0);
        response.setDevelopmentCompletionRate(rate);
        response.setDevelopmentStatus(done == 7 ? "COMPLETED" : done >= 4 ? "IN_PROGRESS" : "PENDING");
    }

    private List<ProductionOrder> loadOrders(String styleNo) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ProductionOrder::getTenantId, tenantId);
        }
        qw.eq(ProductionOrder::getStyleNo, styleNo)
                .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                .orderByDesc(ProductionOrder::getCreateTime);
        return productionOrderService.list(qw);
    }

    private void fillProductionSummary(ProductionSummary summary, List<ProductionOrder> orders, TenantPreferenceProfile tenantProfile) {
        summary.setOrderCount(orders.size());
        summary.setActiveOrderCount((int) orders.stream()
                .filter(order -> !"completed".equalsIgnoreCase(order.getStatus()) && !"cancelled".equalsIgnoreCase(order.getStatus()))
                .count());
        summary.setDelayedOrderCount((int) orders.stream()
                .filter(order -> "delayed".equalsIgnoreCase(order.getStatus()))
                .count());
        summary.setTotalOrderQuantity(orders.stream().mapToInt(order -> safeInt(order.getOrderQuantity())).sum());
        summary.setTotalCompletedQuantity(orders.stream().mapToInt(order -> safeInt(order.getCompletedQuantity())).sum());
        summary.setAvgProductionProgress(orders.isEmpty() ? 0 : (int) Math.round(orders.stream()
                .mapToInt(order -> safeInt(order.getProductionProgress()))
                .average()
                .orElse(0)));

        ProductionOrder latest = orders.stream()
                .max(Comparator.comparing(ProductionOrder::getCreateTime, Comparator.nullsLast(LocalDateTime::compareTo)))
                .orElse(null);
        if (latest != null) {
            summary.setLatestOrderNo(latest.getOrderNo());
            summary.setLatestOrderStatus(latest.getStatus());
            summary.setLatestProductionProgress(safeInt(latest.getProductionProgress()));
            if (latest.getPlannedEndDate() != null) {
                summary.setLatestPlannedEndDate(latest.getPlannedEndDate().format(DATE_FMT));
            }
        }

        ProductionOrder topRiskOrder = orders.stream()
                .max(Comparator.comparingInt(this::calculateOrderRiskScore))
                .orElse(null);
        if (topRiskOrder != null && calculateOrderRiskScore(topRiskOrder) > 0) {
            summary.setTopRiskOrderNo(topRiskOrder.getOrderNo());
            summary.setTopRiskOrderStatus(topRiskOrder.getStatus());
            summary.setTopRiskReason(intelligenceReasonLibraryService.buildOrderRiskReason(topRiskOrder, tenantProfile));
        }
        if (tenantProfile != null) {
            summary.setTopRiskFactoryName(tenantProfile.getTopRiskFactoryName());
            summary.setTopRiskFactoryReason(tenantProfile.getTopRiskFactoryReason());
        }
    }

    private List<ScanRecord> loadScanRecords(String styleNo) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ScanRecord::getTenantId, tenantId);
        }
        qw.eq(ScanRecord::getStyleNo, styleNo)
                .orderByDesc(ScanRecord::getScanTime)
                .last("LIMIT 500");
        return scanRecordService.list(qw);
    }

    private void fillScanSummary(ScanSummary summary, List<ScanRecord> records, TenantPreferenceProfile tenantProfile) {
        summary.setTotalRecords(records.size());
        summary.setSuccessRecords((int) records.stream().filter(this::isSuccessRecord).count());
        summary.setFailedRecords((int) records.stream().filter(record -> !isSuccessRecord(record)).count());
        summary.setSuccessQuantity(records.stream()
                .filter(this::isSuccessRecord)
                .mapToInt(record -> safeInt(record.getQuantity()))
                .sum());
        summary.setSettledRecordCount((int) records.stream()
                .filter(this::isSuccessRecord)
                .filter(record -> hasText(record.getPayrollSettlementId()))
                .count());
        summary.setUnsettledRecordCount((int) records.stream()
                .filter(this::isSuccessRecord)
                .filter(record -> !hasText(record.getPayrollSettlementId()))
                .count());

        ScanRecord latest = records.stream()
                .max(Comparator.comparing(ScanRecord::getScanTime, Comparator.nullsLast(LocalDateTime::compareTo)))
                .orElse(null);
        if (latest != null) {
            summary.setLatestProgressStage(latest.getProgressStage());
            summary.setLatestProcessName(latest.getProcessName());
            if (latest.getScanTime() != null) {
                summary.setLatestScanTime(latest.getScanTime().format(DATE_TIME_FMT));
            }
        }

        Map<String, Integer> anomalyCountByProcess = new HashMap<>();
        Map<String, String> stageByProcess = new HashMap<>();
        records.stream()
                .filter(record -> !isSuccessRecord(record))
                .forEach(record -> {
                    String processName = hasText(record.getProcessName()) ? record.getProcessName() : "未知工序";
                    anomalyCountByProcess.merge(processName, 1, Integer::sum);
                    if (hasText(record.getProgressStage())) {
                        stageByProcess.putIfAbsent(processName, record.getProgressStage());
                    }
                });
        anomalyCountByProcess.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .ifPresent(entry -> {
                    summary.setTopAnomalyProcessName(entry.getKey());
                    summary.setTopAnomalyCount(entry.getValue());
                    summary.setTopAnomalyStage(stageByProcess.get(entry.getKey()));
                });
    }

    private List<SampleStock> loadSampleStocks(String styleNo) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<SampleStock> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(SampleStock::getTenantId, tenantId);
        }
        qw.eq(SampleStock::getStyleNo, styleNo)
                .and(w -> w.isNull(SampleStock::getDeleteFlag).or().eq(SampleStock::getDeleteFlag, 0));
        return sampleStockService.list(qw);
    }

    private void fillStockSummary(StockSummary summary, List<SampleStock> stocks) {
        int total = stocks.stream().mapToInt(stock -> safeInt(stock.getQuantity())).sum();
        int loaned = stocks.stream().mapToInt(stock -> safeInt(stock.getLoanedQuantity())).sum();
        summary.setTotalQuantity(total);
        summary.setLoanedQuantity(loaned);
        summary.setAvailableQuantity(Math.max(0, total - loaned));
        summary.setDevelopmentQuantity(sumStockByType(stocks, "development"));
        summary.setPreProductionQuantity(sumStockByType(stocks, "pre_production"));
        summary.setShipmentQuantity(sumStockByType(stocks, "shipment"));
    }

    private int sumStockByType(List<SampleStock> stocks, String sampleType) {
        return stocks.stream()
                .filter(stock -> sampleType.equalsIgnoreCase(stock.getSampleType()))
                .mapToInt(stock -> safeInt(stock.getQuantity()))
                .sum();
    }

    private void fillFinanceSummary(FinanceSummary summary,
                                    StyleQuotation quotation,
                                    StyleQuoteSuggestionResponse suggestion,
                                    List<ProductionOrder> orders) {
        if (quotation != null) {
            summary.setCurrentQuotation(quotation.getTotalPrice());
            summary.setMaterialCost(quotation.getMaterialCost());
            summary.setProcessCost(quotation.getProcessCost());
            summary.setTotalCost(quotation.getTotalCost());
        }
        if (summary.getCurrentQuotation() == null) {
            summary.setCurrentQuotation(suggestion.getCurrentQuotation());
        }
        summary.setSuggestedQuotation(suggestion.getSuggestedPrice());
        summary.setHistoricalOrderCount(suggestion.getHistoricalOrderCount());
        if (summary.getMaterialCost() == null) {
            summary.setMaterialCost(suggestion.getMaterialCost());
        }
        if (summary.getProcessCost() == null) {
            summary.setProcessCost(suggestion.getProcessCost());
        }
        if (summary.getTotalCost() == null) {
            summary.setTotalCost(suggestion.getTotalCost());
        }
        if (summary.getSuggestedQuotation() != null || summary.getCurrentQuotation() != null) {
            summary.setQuotationGap(scale2(nonNull(summary.getSuggestedQuotation()).subtract(nonNull(summary.getCurrentQuotation()))));
        }

        BigDecimal materialCost = nonNull(summary.getMaterialCost());
        BigDecimal processCost = nonNull(summary.getProcessCost());
        BigDecimal otherCost = nonNull(summary.getTotalCost()).subtract(materialCost).subtract(processCost);
        if (processCost.compareTo(materialCost) >= 0 && processCost.compareTo(otherCost) >= 0) {
            summary.setCostPressureSource("PROCESS");
            summary.setCostPressureAmount(scale2(processCost));
        } else if (materialCost.compareTo(processCost) >= 0 && materialCost.compareTo(otherCost) >= 0) {
            summary.setCostPressureSource("MATERIAL");
            summary.setCostPressureAmount(scale2(materialCost));
        } else if (otherCost.compareTo(BigDecimal.ZERO) > 0) {
            summary.setCostPressureSource("OTHER");
            summary.setCostPressureAmount(scale2(otherCost));
        }

        int totalOrderQty = orders.stream().mapToInt(order -> safeInt(order.getOrderQuantity())).sum();
        BigDecimal quotePrice = nonNull(summary.getCurrentQuotation());
        BigDecimal estimatedRevenue = quotePrice.multiply(BigDecimal.valueOf(Math.max(0, totalOrderQty)));
        BigDecimal estimatedProcessingCost = orders.stream()
                .map(order -> nonNull(order.getFactoryUnitPrice()).multiply(BigDecimal.valueOf(Math.max(0, safeInt(order.getCompletedQuantity())))))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        summary.setEstimatedRevenue(scale2(estimatedRevenue));
        summary.setEstimatedProcessingCost(scale2(estimatedProcessingCost));
        BigDecimal grossProfit = estimatedRevenue.subtract(estimatedProcessingCost);
        summary.setEstimatedGrossProfit(scale2(grossProfit));
        if (estimatedRevenue.compareTo(BigDecimal.ZERO) > 0) {
            summary.setEstimatedGrossMargin(scale2(grossProfit
                    .divide(estimatedRevenue, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100))));
        } else {
            summary.setEstimatedGrossMargin(BigDecimal.ZERO);
        }
    }

    private List<StageStatus> buildStages(StyleInfo style) {
        List<StageStatus> stages = new ArrayList<>();
        stages.add(buildStage("bom", "BOM", style.getBomAssignee(), style.getBomStartTime(), style.getBomCompletedTime()));
        stages.add(buildStage("pattern", "纸样", style.getPatternAssignee(), style.getPatternStartTime(), style.getPatternCompletedTime(), style.getPatternStatus()));
        stages.add(buildStage("size", "尺寸", style.getSizeAssignee(), style.getSizeStartTime(), style.getSizeCompletedTime()));
        stages.add(buildStage("production", "制单", style.getProductionAssignee(), style.getProductionStartTime(), style.getProductionCompletedTime()));
        stages.add(buildStage("secondary", "二次工艺", style.getSecondaryAssignee(), style.getSecondaryStartTime(), style.getSecondaryCompletedTime()));
        stages.add(buildStage("process", "工序单价", style.getProcessAssignee(), style.getProcessStartTime(), style.getProcessCompletedTime()));
        stages.add(buildStage("sizePrice", "码数单价", style.getSizePriceAssignee(), style.getSizePriceStartTime(), style.getSizePriceCompletedTime()));
        return stages;
    }

    private StageStatus buildStage(String key, String label, String assignee,
                                   LocalDateTime startTime, LocalDateTime completedTime) {
        return buildStage(key, label, assignee, startTime, completedTime, null);
    }

    private StageStatus buildStage(String key, String label, String assignee,
                                   LocalDateTime startTime, LocalDateTime completedTime, String explicitStatus) {
        StageStatus stage = new StageStatus();
        stage.setKey(key);
        stage.setLabel(label);
        stage.setAssignee(assignee);
        stage.setStartTime(formatDateTime(startTime));
        stage.setCompletedTime(formatDateTime(completedTime));
        if (hasText(explicitStatus)) {
            stage.setStatus(explicitStatus);
        } else if (completedTime != null) {
            stage.setStatus("COMPLETED");
        } else if (startTime != null) {
            stage.setStatus("IN_PROGRESS");
        } else {
            stage.setStatus("NOT_STARTED");
        }
        return stage;
    }

    private List<String> buildInsights(StyleInfo style,
                                       StyleIntelligenceProfileResponse response,
                                       StyleQuoteSuggestionResponse suggestion) {
        List<String> insights = new ArrayList<>();
        if ("OVERDUE".equals(response.getDeliveryRisk())) {
            insights.add(String.format("交板日期已逾期 %d 天，建议优先推进未完成的开发节点。", Math.abs(safeInt(response.getDaysToDelivery()))));
        } else if ("WARNING".equals(response.getDeliveryRisk())) {
            insights.add(String.format("交板日期将在 %d 天内到来，建议今天内锁定纸样、工序单价与生产制单。", safeInt(response.getDaysToDelivery())));
        }

        if (response.getDevelopmentCompletionRate() != null && response.getDevelopmentCompletionRate() < 60) {
            insights.add(String.format("当前开发完成度仅 %d%%，还不适合直接放量生产。", response.getDevelopmentCompletionRate()));
        }

        if (response.getProduction().getOrderCount() > 0 && response.getProduction().getAvgProductionProgress() < 50) {
            insights.add(String.format("已有 %d 个关联订单，但平均生产进度仅 %d%%，需要提前干预工厂节奏。",
                    response.getProduction().getOrderCount(), response.getProduction().getAvgProductionProgress()));
        }
        if (hasText(response.getProduction().getTopRiskOrderNo())) {
            insights.add(String.format("当前最危险订单是 %s，原因：%s", response.getProduction().getTopRiskOrderNo(), response.getProduction().getTopRiskReason()));
        }
        if (hasText(response.getProduction().getTopRiskFactoryName())) {
            insights.add(String.format("当前风险主要来自工厂 %s，%s", response.getProduction().getTopRiskFactoryName(), response.getProduction().getTopRiskFactoryReason()));
        }

        if (response.getScan().getFailedRecords() > 0) {
            insights.add(String.format("检测到 %d 条异常扫码记录，建议排查最近工序与质检环节。", response.getScan().getFailedRecords()));
        }
        if (hasText(response.getScan().getTopAnomalyProcessName())) {
            insights.add(intelligenceReasonLibraryService.buildScanAnomalyReason(
                    response.getScan().getTopAnomalyStage(),
                    response.getScan().getTopAnomalyProcessName(),
                    safeInt(response.getScan().getTopAnomalyCount()),
                    response.getTenantProfile().getAnomalyWarningCount()));
        }

        if (response.getFinance().getEstimatedGrossMargin() != null
                && response.getFinance().getEstimatedGrossMargin().compareTo(response.getTenantProfile().getLowMarginThreshold()) < 0
                && response.getFinance().getEstimatedRevenue() != null
                && response.getFinance().getEstimatedRevenue().compareTo(BigDecimal.ZERO) > 0) {
            insights.add("当前预计毛利偏低，建议复核报价与加工成本，避免后续财务吃亏。");
        }
        if (response.getFinance().getQuotationGap() != null
                && response.getFinance().getQuotationGap().abs().compareTo(BigDecimal.ONE) >= 0) {
            insights.add(String.format("AI 建议报价与当前报价相差 %s，说明这款仍有定价修正空间。",
                    response.getFinance().getQuotationGap().toPlainString()));
        }
        if (hasText(response.getFinance().getCostPressureSource())) {
            insights.add(intelligenceReasonLibraryService.buildProfitPressureReason(
                    response.getFinance().getCostPressureSource(),
                    response.getFinance().getCostPressureAmount(),
                    response.getFinance().getEstimatedGrossMargin(),
                    response.getTenantProfile().getLowMarginThreshold()));
        }

        if (!hasText(style.getProcessAssignee()) || style.getProcessCompletedTime() == null) {
            insights.add("工序单价尚未完全锁定，后续报价、生产和工资结算会持续受影响。");
        }

        if (suggestion != null && hasText(suggestion.getSuggestion())) {
            insights.add(suggestion.getSuggestion());
        }

        if (insights.isEmpty()) {
            insights.add("当前款式主数据较完整，建议继续让生产、入库、财务数据持续回流到这张档案卡。");
        }
        return insights.stream().filter(Objects::nonNull).distinct().limit(6).toList();
    }

    private boolean isSuccessRecord(ScanRecord record) {
        return "success".equalsIgnoreCase(record.getScanResult()) && safeInt(record.getQuantity()) > 0;
    }

    private int calculateOrderRiskScore(ProductionOrder order) {
        int score = 0;
        if ("delayed".equalsIgnoreCase(order.getStatus())) {
            score += 100;
        }
        int progress = safeInt(order.getProductionProgress());
        if (progress < 30) {
            score += 40;
        } else if (progress < 60) {
            score += 20;
        }
        if (order.getPlannedEndDate() != null) {
            long diffDays = ChronoUnit.DAYS.between(LocalDate.now(), order.getPlannedEndDate().toLocalDate());
            if (diffDays < 0) {
                score += 60;
            } else if (diffDays <= 3) {
                score += 30;
            }
        }
        int orderQty = safeInt(order.getOrderQuantity());
        int completedQty = safeInt(order.getCompletedQuantity());
        if (orderQty > 0 && completedQty < orderQty / 2) {
            score += 10;
        }
        return score;
    }

    private String formatDateTime(LocalDateTime value) {
        return value == null ? null : value.format(DATE_TIME_FMT);
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private BigDecimal scale2(BigDecimal value) {
        return nonNull(value).setScale(2, RoundingMode.HALF_UP);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
