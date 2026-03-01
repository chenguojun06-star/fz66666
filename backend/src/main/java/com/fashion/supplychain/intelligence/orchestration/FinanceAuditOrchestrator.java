package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse.AuditFinding;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse.PriceDeviation;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse.ProfitAnalysis;
import com.fashion.supplychain.intelligence.dto.FinanceAuditResponse.Summary;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 财务审核智能编排器 — 一站式审核看板
 *
 * <p>五大能力合一：结算差异 / 单价偏离 / 重复结算 / 利润分级 / 审核建议
 * <p>只读分析，不修改任何业务数据
 */
@Service
@Slf4j
public class FinanceAuditOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    public FinanceAuditResponse audit() {
        FinanceAuditResponse resp = new FinanceAuditResponse();
        try {
            Long tenantId = UserContext.tenantId();
            List<ProductionOrder> orders = loadRecentOrders(tenantId);
            List<AuditFinding> findings = new ArrayList<>();

            ProfitAnalysis profitAnalysis = new ProfitAnalysis();
            List<PriceDeviation> priceDeviations = new ArrayList<>();
            int duplicateSuspect = 0;

            // 工厂历史均价缓存: factoryName -> (totalPrice, count)
            Map<String, BigDecimal[]> factoryPriceHistory = buildFactoryPriceHistory(orders);

            for (ProductionOrder order : orders) {
                // ① 结算差异检测
                checkQuantityMismatch(order, findings);
                // ② 单价偏离预警
                checkPriceDeviation(order, factoryPriceHistory, priceDeviations, findings);
                // ③ 利润率分析
                analyzeProfitMargin(order, profitAnalysis, findings);
            }

            // ④ 重复结算检查（批量）
            duplicateSuspect = checkDuplicateSettlement(tenantId, findings);

            // ⑤ 汇总 + 审核建议
            Summary summary = buildSummary(orders, findings, duplicateSuspect);
            resp.setSummary(summary);
            resp.setFindings(findings);
            resp.setProfitAnalysis(profitAnalysis);
            resp.setPriceDeviations(priceDeviations);
            resp.setOverallRisk(deriveOverallRisk(summary));
            resp.setSuggestion(deriveSuggestion(summary));
            resp.setSuggestionText(buildSuggestionText(summary));
        } catch (Exception e) {
            log.error("[财务审核] 分析异常: {}", e.getMessage(), e);
            resp.setOverallRisk("LOW");
            resp.setSuggestion("REVIEW");
            resp.setSuggestionText("数据分析异常，请稍后重试");
            resp.setFindings(List.of());
        }
        return resp;
    }

    // ── 数据加载 ──

    private List<ProductionOrder> loadRecentOrders(Long tenantId) {
        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ProductionOrder::getTenantId, tenantId);
        }
        qw.in(ProductionOrder::getStatus, "production", "completed", "delayed");
        qw.and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0));
        qw.orderByDesc(ProductionOrder::getCreateTime);
        qw.last("LIMIT 200");
        return productionOrderService.list(qw);
    }

    // ── ① 结算差异检测 ──

    private void checkQuantityMismatch(ProductionOrder order, List<AuditFinding> findings) {
        int orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        int completedQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        if (orderQty <= 0) return;

        // 完成数远超订单数 → 可能多结算
        if (completedQty > orderQty * 1.1) {
            AuditFinding f = new AuditFinding();
            f.setType("QUANTITY_MISMATCH");
            f.setRiskLevel("HIGH");
            f.setOrderNo(order.getOrderNo());
            f.setDescription(String.format("完成数(%d)超出订单数(%d)的10%%", completedQty, orderQty));
            f.setAmount(BigDecimal.valueOf(completedQty - orderQty));
            f.setAction("核实是否存在补单或多扫码");
            findings.add(f);
        }
    }

    // ── ② 单价偏离预警 ──

    private Map<String, BigDecimal[]> buildFactoryPriceHistory(List<ProductionOrder> orders) {
        Map<String, BigDecimal[]> history = new HashMap<>();
        for (ProductionOrder o : orders) {
            String fn = o.getFactoryName();
            BigDecimal fp = o.getFactoryUnitPrice();
            if (fn == null || fn.isBlank() || fp == null || fp.compareTo(BigDecimal.ZERO) <= 0) continue;
            history.computeIfAbsent(fn, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal[] arr = history.get(fn);
            arr[0] = arr[0].add(fp);
            arr[1] = arr[1].add(BigDecimal.ONE);
        }
        return history;
    }

    private void checkPriceDeviation(ProductionOrder order,
            Map<String, BigDecimal[]> history,
            List<PriceDeviation> deviations,
            List<AuditFinding> findings) {
        String fn = order.getFactoryName();
        BigDecimal fp = order.getFactoryUnitPrice();
        if (fn == null || fn.isBlank() || fp == null || fp.compareTo(BigDecimal.ZERO) <= 0) return;
        BigDecimal[] arr = history.get(fn);
        if (arr == null || arr[1].compareTo(BigDecimal.valueOf(2)) < 0) return;

        BigDecimal avg = arr[0].divide(arr[1], 2, RoundingMode.HALF_UP);
        if (avg.compareTo(BigDecimal.ZERO) <= 0) return;

        BigDecimal deviationPct = fp.subtract(avg).abs()
                .divide(avg, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));

        if (deviationPct.compareTo(BigDecimal.valueOf(20)) >= 0) {
            PriceDeviation pd = new PriceDeviation();
            pd.setOrderNo(order.getOrderNo());
            pd.setStyleNo(order.getStyleNo());
            pd.setFactoryName(fn);
            pd.setCurrentPrice(fp);
            pd.setAvgHistoryPrice(avg);
            pd.setDeviationPercent(deviationPct.setScale(1, RoundingMode.HALF_UP));
            pd.setRiskLevel(deviationPct.compareTo(BigDecimal.valueOf(50)) >= 0 ? "HIGH" : "MEDIUM");
            deviations.add(pd);

            AuditFinding f = new AuditFinding();
            f.setType("PRICE_DEVIATION");
            f.setRiskLevel(pd.getRiskLevel());
            f.setOrderNo(order.getOrderNo());
            f.setDescription(String.format("%s 单价¥%s偏离均值¥%s达%.1f%%",
                    fn, fp.toPlainString(), avg.toPlainString(), deviationPct.doubleValue()));
            f.setAmount(fp.subtract(avg).abs());
            f.setAction("核实报价单或是否为特殊工艺");
            findings.add(f);
        }
    }

    // ── ③ 利润率分析 ──

    private void analyzeProfitMargin(ProductionOrder order, ProfitAnalysis pa, List<AuditFinding> findings) {
        BigDecimal quote = order.getQuotationUnitPrice();
        BigDecimal factory = order.getFactoryUnitPrice();
        if (quote == null || factory == null || quote.compareTo(BigDecimal.ZERO) <= 0) {
            pa.setNormalCount(pa.getNormalCount() + 1);
            return;
        }
        double margin = quote.subtract(factory)
                .divide(quote, 4, RoundingMode.HALF_UP).doubleValue() * 100;

        if (margin < 0) {
            pa.setNegativeCount(pa.getNegativeCount() + 1);
            addProfitFinding(order, margin, "HIGH", "订单亏损", findings);
        } else if (margin < 5) {
            pa.setLowProfitCount(pa.getLowProfitCount() + 1);
            addProfitFinding(order, margin, "MEDIUM", "利润率极低", findings);
        } else if (margin > 50) {
            pa.setAbnormalHighCount(pa.getAbnormalHighCount() + 1);
            addProfitFinding(order, margin, "MEDIUM", "利润率异常偏高", findings);
        } else {
            pa.setNormalCount(pa.getNormalCount() + 1);
        }

        // 累加平均值
        BigDecimal current = pa.getAvgProfitMargin() != null ? pa.getAvgProfitMargin() : BigDecimal.ZERO;
        int totalCount = pa.getNegativeCount() + pa.getLowProfitCount()
                + pa.getAbnormalHighCount() + pa.getNormalCount();
        pa.setAvgProfitMargin(current.multiply(BigDecimal.valueOf(totalCount - 1))
                .add(BigDecimal.valueOf(margin))
                .divide(BigDecimal.valueOf(totalCount), 1, RoundingMode.HALF_UP));
    }

    private void addProfitFinding(ProductionOrder order, double margin,
            String risk, String label, List<AuditFinding> findings) {
        AuditFinding f = new AuditFinding();
        f.setType("PROFIT_ANOMALY");
        f.setRiskLevel(risk);
        f.setOrderNo(order.getOrderNo());
        f.setDescription(String.format("%s: 利润率%.1f%%", label, margin));
        f.setAction(margin < 0 ? "紧急审查成本结构" : "复核报价合理性");
        findings.add(f);
    }

    // ── ④ 重复结算检查 ──

    private int checkDuplicateSettlement(Long tenantId, List<AuditFinding> findings) {
        // 查找被关联到结算单但 quantity=0 或 scanResult!=success 的异常记录
        LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ScanRecord::getTenantId, tenantId);
        }
        qw.isNotNull(ScanRecord::getPayrollSettlementId);
        qw.ne(ScanRecord::getPayrollSettlementId, "");
        qw.and(w -> w.ne(ScanRecord::getScanResult, "success")
                .or().le(ScanRecord::getQuantity, 0));
        qw.last("LIMIT 50");
        List<ScanRecord> suspects = scanRecordService.list(qw);

        for (ScanRecord sr : suspects) {
            AuditFinding f = new AuditFinding();
            f.setType("DUPLICATE_SETTLEMENT");
            f.setRiskLevel("HIGH");
            f.setOrderNo(sr.getOrderNo());
            f.setDescription(String.format("扫码记录(结果:%s,数量:%d)被关联到结算单%s",
                    sr.getScanResult(), sr.getQuantity() != null ? sr.getQuantity() : 0,
                    sr.getPayrollSettlementId()));
            f.setAction("检查该结算单是否包含无效扫码记录");
            findings.add(f);
        }
        return suspects.size();
    }

    // ── ⑤ 汇总与建议 ──

    private Summary buildSummary(List<ProductionOrder> orders,
            List<AuditFinding> findings, int duplicateSuspect) {
        Summary s = new Summary();
        s.setTotalOrders(orders.size());
        s.setTotalWarehousedQty(orders.stream()
                .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum());
        s.setTotalSettlementAmount(BigDecimal.ZERO); // 简化：无直接聚合
        s.setAnomalyCount(findings.size());
        s.setHighRiskCount((int) findings.stream().filter(f -> "HIGH".equals(f.getRiskLevel())).count());
        s.setDuplicateSuspectCount(duplicateSuspect);
        return s;
    }

    private String deriveOverallRisk(Summary s) {
        if (s.getHighRiskCount() >= 3 || s.getDuplicateSuspectCount() > 0) return "HIGH";
        if (s.getAnomalyCount() >= 5) return "MEDIUM";
        return "LOW";
    }

    private String deriveSuggestion(Summary s) {
        if (s.getHighRiskCount() >= 3 || s.getDuplicateSuspectCount() > 0) return "REJECT";
        if (s.getAnomalyCount() >= 3) return "REVIEW";
        return "APPROVE";
    }

    private String buildSuggestionText(Summary s) {
        if (s.getHighRiskCount() >= 3) {
            return String.format("发现%d项高风险异常，建议驳回并逐项核实", s.getHighRiskCount());
        }
        if (s.getDuplicateSuspectCount() > 0) {
            return String.format("发现%d条疑似无效结算关联，建议复核结算单", s.getDuplicateSuspectCount());
        }
        if (s.getAnomalyCount() >= 3) {
            return String.format("发现%d项异常，建议人工复核后审批", s.getAnomalyCount());
        }
        if (s.getAnomalyCount() > 0) {
            return String.format("发现%d项轻微异常，整体风险可控，建议通过", s.getAnomalyCount());
        }
        return "各项指标正常，建议通过审批";
    }
}
