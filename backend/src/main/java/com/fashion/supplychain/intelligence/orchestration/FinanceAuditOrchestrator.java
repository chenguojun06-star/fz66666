package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
import org.springframework.util.StringUtils;

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String factoryId = UserContext.factoryId();
            List<ProductionOrder> orders = loadRecentOrders(tenantId, factoryId);
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
            duplicateSuspect = checkDuplicateSettlement(tenantId, factoryId, findings);

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

    private List<ProductionOrder> loadRecentOrders(Long tenantId, String factoryId) {
        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ProductionOrder::getTenantId, tenantId);
        }
        qw.eq(StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId);
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
            f.setDescription(String.format("工价异常飙升: %s 当前核价¥%s，偏离其历史结算锚点(¥%s)达 %.1f%%",
                    fn, fp.toPlainString(), avg.toPlainString(), deviationPct.doubleValue()));
            f.setAmount(fp.subtract(avg).abs());
            f.setAction("调取 IE 工位图核实是否工艺难度升级导致，防范暗箱改价");
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
            addProfitFinding(order, margin, "HIGH", "严重利润倒挂（穿底亏损）", findings);
        } else if (margin < 5) {
            pa.setLowProfitCount(pa.getLowProfitCount() + 1);
            addProfitFinding(order, margin, "MEDIUM", "击穿利润红线（低毛利）", findings);
        } else if (margin > 50) {
            pa.setAbnormalHighCount(pa.getAbnormalHighCount() + 1);
            addProfitFinding(order, margin, "MEDIUM", "毛利异常虚高（疑似漏计成本）", findings);
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
        f.setDescription(String.format("%s: 当前核算利润率仅 %.1f%%", label, margin));
        f.setAction(margin < 0 ? "立刻冻结单据，启动全链路成本盘查追踪！" : "追溯核实 IE 报价及原辅料 BOM 成本是否对齐");
        findings.add(f);
    }

    // ── ④ 重复结算检查 ──

    private int checkDuplicateSettlement(Long tenantId, String factoryId, List<AuditFinding> findings) {
        // 查找被关联到结算单但 quantity=0 或 scanResult!=success 的异常记录
        LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            qw.eq(ScanRecord::getTenantId, tenantId);
        }
        qw.eq(StringUtils.hasText(factoryId), ScanRecord::getFactoryId, factoryId);
        qw.ne(ScanRecord::getScanType, "orchestration");
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
            f.setDescription(String.format("发现飞单/串单套现嫌疑：废案类脱序扫码(结果:%s,件数:%d)强制入账了计件流水单 %s",
                    sr.getScanResult(), sr.getQuantity() != null ? sr.getQuantity() : 0,
                    sr.getPayrollSettlementId()));
            f.setAction("🚨 高危诈骗工价动作：立刻截停该工资结算批次，逐一人事面谈核查！");
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
            return String.format("⚠️ 触碰财务审核最高红线！命中 %d 项关键风控指标，系统已建议锁定所有涉事账单，请总监级介入逐条约谈各车间负责人核算！", s.getHighRiskCount());
        }
        if (s.getDuplicateSuspectCount() > 0) {
            return String.format("🚨 资金漏损风险：发现 %d 条疑似套现的废弃计件，建议重度筛查对应结算批次单据，谨防多算误发！", s.getDuplicateSuspectCount());
        }
        if (s.getAnomalyCount() >= 3) {
            return String.format("发现 %d 项财务异动预警信号，系统判定需由人工出具复核证明方可放行审批。", s.getAnomalyCount());
        }
        if (s.getAnomalyCount() > 0) {
            return String.format("包含 %d 项常规波动指标，当前成本敞口尚在安全防滚区内，常规审核即可。", s.getAnomalyCount());
        }
        return "✅ 数据防波堤未见异动：各项核心成本红线正常，可快速闭环签批。";
    }
}
