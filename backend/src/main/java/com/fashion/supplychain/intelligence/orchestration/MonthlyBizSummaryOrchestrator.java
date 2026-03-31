package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 月度经营汇总编排器
 * 汇总维度：生产件数/次品返修率/各工厂产量/面辅料进出/成品进出/人工成本/利润
 */
@Slf4j
@Service
public class MonthlyBizSummaryOrchestrator {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private MaterialInboundService materialInboundService;
    @Autowired private MaterialOutboundLogMapper materialOutboundLogMapper;
    @Autowired private ProductOutstockService productOutstockService;
    @Autowired private FinishedProductSettlementService settlementService;

    public Map<String, Object> getMonthly(int year, int month) {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        LocalDateTime start = LocalDateTime.of(year, month, 1, 0, 0, 0);
        LocalDateTime end = start.plusMonths(1);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("year", year);
        result.put("month", month);
        result.put("period", year + "年" + month + "月经营汇总");
        result.put("startDate", start.toLocalDate().toString());
        result.put("endDate", end.toLocalDate().minusDays(1).toString());
        result.put("production", buildProductionStats(tenantId, factoryId, start, end));
        result.put("factoryBreakdown", buildFactoryBreakdown(tenantId, factoryId, start, end));
        result.put("materialStock", buildMaterialStats(tenantId, start, end));
        result.put("finishedGoods", buildFinishedGoodsStats(tenantId, factoryId, start, end));
        result.put("finance", buildFinanceStats(tenantId, factoryId, start, end));
        return result;
    }

    // ── 1. 生产总览 ──────────────────────────────────────────────────
    private Map<String, Object> buildProductionStats(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        long produced    = sumScan(tenantId, factoryId, start, end, "production", "success");
        long qualityTotal = sumScan(tenantId, factoryId, start, end, "quality", null);
        long defects      = sumScan(tenantId, factoryId, start, end, "quality", "failure");
        long qualityPassed = qualityTotal - defects;
        double defectRatePct = qualityTotal > 0 ? round2(defects * 100.0 / qualityTotal) : 0.0;

        QueryWrapper<ProductionOrder> newOrdQw = new QueryWrapper<>();
        if (tenantId != null) newOrdQw.eq("tenant_id", tenantId);
        if (StringUtils.hasText(factoryId)) newOrdQw.eq("factory_id", factoryId);
        newOrdQw.ge("create_time", start).lt("create_time", end).eq("delete_flag", 0);
        long newOrders = productionOrderService.count(newOrdQw);

        QueryWrapper<ProductionOrder> doneQw = new QueryWrapper<>();
        if (tenantId != null) doneQw.eq("tenant_id", tenantId);
        if (StringUtils.hasText(factoryId)) doneQw.eq("factory_id", factoryId);
        doneQw.eq("status", "COMPLETED").ge("update_time", start).lt("update_time", end).eq("delete_flag", 0);
        long completedOrders = productionOrderService.count(doneQw);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("producedPieces", produced);
        m.put("qualityScanned", qualityTotal);
        m.put("defectPieces", defects);
        m.put("passedPieces", qualityPassed);
        m.put("defectRatePct", defectRatePct);
        m.put("repairRatePct", defectRatePct);
        m.put("newOrders", newOrders);
        m.put("completedOrders", completedOrders);
        return m;
    }

    // ── 2. 各工厂件数 ──────────────────────────────────────────────────
    private List<Map<String, Object>> buildFactoryBreakdown(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        if (tenantId != null) qw.eq("tenant_id", tenantId);
        if (StringUtils.hasText(factoryId)) qw.eq("factory_id", factoryId);
        qw.eq("scan_type", "production").eq("scan_result", "success")
          .ge("scan_time", start).lt("scan_time", end)
          .select("order_id", "quantity");
        List<ScanRecord> records = scanRecordService.list(qw);
        if (records.isEmpty()) return Collections.emptyList();

        Map<String, Long> orderQty = new HashMap<>();
        for (ScanRecord r : records) {
            if (r.getOrderId() != null) {
                orderQty.merge(r.getOrderId(), (long)(r.getQuantity() == null ? 0 : r.getQuantity()), Long::sum);
            }
        }

        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.in("id", orderQty.keySet()).select("id", "factory_name");
        Map<String, String> idToFactory = new HashMap<>();
        for (ProductionOrder o : productionOrderService.list(oqw)) {
            if (o.getId() != null) {
                idToFactory.put(o.getId(), o.getFactoryName() == null ? "未分配" : o.getFactoryName());
            }
        }

        Map<String, Long> factoryQty = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : orderQty.entrySet()) {
            String factory = idToFactory.getOrDefault(e.getKey(), "未分配");
            factoryQty.merge(factory, e.getValue(), Long::sum);
        }

        return factoryQty.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .map(e -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("factoryName", e.getKey());
                row.put("pieces", e.getValue());
                return row;
            })
            .collect(Collectors.toList());
    }

    // ── 3. 面辅料进出 ──────────────────────────────────────────────────
    private Map<String, Object> buildMaterialStats(Long tenantId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<MaterialInbound> iqw = new QueryWrapper<>();
        if (tenantId != null) iqw.eq("tenant_id", tenantId);
        iqw.ge("inbound_time", start).lt("inbound_time", end).select("inbound_quantity");
        List<MaterialInbound> inbounds = materialInboundService.list(iqw);
        long inboundQty = inbounds.stream()
            .mapToLong(i -> i.getInboundQuantity() == null ? 0 : i.getInboundQuantity()).sum();

        QueryWrapper<MaterialOutboundLog> oqw = new QueryWrapper<>();
        if (tenantId != null) oqw.eq("tenant_id", tenantId);
        oqw.ge("outbound_time", start).lt("outbound_time", end).eq("delete_flag", 0).select("quantity");
        List<MaterialOutboundLog> outbounds = materialOutboundLogMapper.selectList(oqw);
        long outboundQty = outbounds.stream()
            .mapToLong(o -> o.getQuantity() == null ? 0 : o.getQuantity()).sum();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("inboundCount", inbounds.size());
        m.put("inboundQuantity", inboundQty);
        m.put("outboundQuantity", outboundQty);
        return m;
    }

    // ── 4. 成品进出 ──────────────────────────────────────────────────
    private Map<String, Object> buildFinishedGoodsStats(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        long inboundPieces = sumScan(tenantId, factoryId, start, end, "warehouse", "success");

        QueryWrapper<ProductOutstock> oqw = new QueryWrapper<>();
        if (tenantId != null) oqw.eq("tenant_id", tenantId);
        oqw.ge("create_time", start).lt("create_time", end).select("outstock_quantity");
        long outboundPieces = productOutstockService.list(oqw).stream()
            .mapToLong(o -> o.getOutstockQuantity() == null ? 0 : o.getOutstockQuantity()).sum();

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("inboundPieces", inboundPieces);
        m.put("outboundPieces", outboundPieces);
        return m;
    }

    // ── 5. 财务汇总 ──────────────────────────────────────────────────
    private Map<String, Object> buildFinanceStats(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> cqw = new QueryWrapper<>();
        if (tenantId != null) cqw.eq("tenant_id", tenantId);
        if (StringUtils.hasText(factoryId)) cqw.eq("factory_id", factoryId);
        cqw.eq("scan_result", "success").isNotNull("scan_cost")
           .ge("scan_time", start).lt("scan_time", end).select("scan_cost");
        BigDecimal laborCost = scanRecordService.list(cqw).stream()
            .map(ScanRecord::getScanCost).filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        QueryWrapper<FinishedProductSettlement> sqw = new QueryWrapper<>();
        if (tenantId != null) sqw.eq("tenant_id", tenantId);
        sqw.ge("update_time", start).lt("update_time", end)
           .select("profit", "style_final_price");
        List<FinishedProductSettlement> settlements = settlementService.list(sqw);

        BigDecimal totalProfit = settlements.stream()
            .map(FinishedProductSettlement::getProfit).filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalRevenue = settlements.stream()
            .map(FinishedProductSettlement::getStyleFinalPrice).filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalRevenue.compareTo(BigDecimal.ZERO) == 0) {
            // fallback: 利润+人工成本估算收入
            totalRevenue = totalProfit.add(laborCost);
        }

        double marginPct = totalRevenue.compareTo(BigDecimal.ZERO) > 0
            ? round2(totalProfit.divide(totalRevenue, 4, RoundingMode.HALF_UP).doubleValue() * 100) : 0.0;

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("laborCost", laborCost.setScale(2, RoundingMode.HALF_UP));
        m.put("estimatedRevenue", totalRevenue.setScale(2, RoundingMode.HALF_UP));
        m.put("settlementProfit", totalProfit.setScale(2, RoundingMode.HALF_UP));
        m.put("grossMarginPct", marginPct);
        return m;
    }

    // ── 工具方法 ──────────────────────────────────────────────────────
    private long sumScan(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end,
                         String type, String result) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        if (tenantId != null) qw.eq("tenant_id", tenantId);
        if (StringUtils.hasText(factoryId)) qw.eq("factory_id", factoryId);
        if (type != null) qw.eq("scan_type", type);
        if (result != null) qw.eq("scan_result", result);
        qw.ge("scan_time", start).lt("scan_time", end).select("quantity");
        return scanRecordService.list(qw).stream()
            .mapToLong(r -> r.getQuantity() == null ? 0 : r.getQuantity()).sum();
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
