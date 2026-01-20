package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.dto.IdReasonRequest;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import javax.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

@RestController
@RequestMapping("/api/finance/reconciliation")
public class ReconciliationCompatController {

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @PutMapping("/status")
    public Result<?> updateStatus(@RequestParam("id") String id, @RequestParam("status") String status) {
        String message = reconciliationStatusOrchestrator.updateStatusCompat(id, status);
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        String message = reconciliationStatusOrchestrator.returnCompat(body.getId(), body.getReason());
        return Result.successMessage(message);
    }

    @GetMapping("/order-profit")
    public Result<?> orderProfit(
            @RequestParam(value = "orderId", required = false) String orderId,
            @RequestParam(value = "orderNo", required = false) String orderNo) {
        String oid = orderId == null ? null : orderId.trim();
        String ono = orderNo == null ? null : orderNo.trim();
        if ((oid == null || oid.isEmpty()) && (ono == null || ono.isEmpty())) {
            throw new IllegalArgumentException("orderId或orderNo不能为空");
        }

        ProductionOrder order;
        if (oid != null && !oid.isEmpty()) {
            order = productionOrderService.getById(oid);
        } else {
            order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, ono)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("limit 1"));
        }

        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new java.util.NoSuchElementException("订单不存在");
        }

        String resolvedOrderId = order.getId() == null ? null : order.getId().trim();
        if (resolvedOrderId == null || resolvedOrderId.isEmpty()) {
            throw new java.util.NoSuchElementException("订单不存在");
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();

        int warehousingQty = 0;
        java.util.List<ProductWarehousing> warehousings = productWarehousingService
                .list(new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getOrderId, resolvedOrderId)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByDesc(ProductWarehousing::getCreateTime));
        if (warehousings != null) {
            long sum = 0;
            for (ProductWarehousing w : warehousings) {
                if (w == null) {
                    continue;
                }
                int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                if (q > 0) {
                    sum += q;
                }
            }
            warehousingQty = (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
        }

        java.util.List<MaterialPurchase> purchases = materialPurchaseService
                .list(new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, resolvedOrderId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .orderByDesc(MaterialPurchase::getCreateTime));

        java.util.List<ShipmentReconciliation> shipmentRecs = shipmentReconciliationService
                .list(new LambdaQueryWrapper<ShipmentReconciliation>()
                        .eq(ShipmentReconciliation::getOrderId, resolvedOrderId)
                        .orderByDesc(ShipmentReconciliation::getCreateTime));

        MaterialPurchaseService.ArrivalStats materialStats = materialPurchaseService.computeArrivalStats(purchases);
        BigDecimal materialPlannedCost = materialStats == null || materialStats.getPlannedAmount() == null
                ? BigDecimal.ZERO
                : materialStats.getPlannedAmount();
        BigDecimal materialArrivedCost = materialStats == null || materialStats.getArrivedAmount() == null
                ? BigDecimal.ZERO
                : materialStats.getArrivedAmount();

        BigDecimal processingCost = BigDecimal.ZERO;
        BigDecimal processingCostPaid = BigDecimal.ZERO;

        BigDecimal shipmentRevenue = BigDecimal.ZERO;
        BigDecimal shipmentRevenueTotal = BigDecimal.ZERO;
        if (shipmentRecs != null) {
            for (ShipmentReconciliation r : shipmentRecs) {
                if (r == null) {
                    continue;
                }
                BigDecimal amt = nonNeg(amountPreferFinal(r.getFinalAmount(), r.getTotalAmount()));
                shipmentRevenueTotal = shipmentRevenueTotal.add(amt);
                String st = r.getStatus() == null ? "" : r.getStatus().trim();
                if ("paid".equalsIgnoreCase(st)) {
                    shipmentRevenue = shipmentRevenue.add(amt);
                }
            }
        }

        StyleQuotation styleQuotation = null;
        BigDecimal quotationUnitCost = BigDecimal.ZERO;
        BigDecimal quotationUnitPrice = BigDecimal.ZERO;

        Long styleId = null;
        String orderStyleId = order.getStyleId() == null ? null : order.getStyleId().trim();
        if (orderStyleId != null && !orderStyleId.isEmpty()) {
            boolean numeric = true;
            for (int i = 0; i < orderStyleId.length(); i++) {
                if (!Character.isDigit(orderStyleId.charAt(i))) {
                    numeric = false;
                    break;
                }
            }
            if (numeric) {
                styleId = Long.parseLong(orderStyleId);
            }
        }
        if (styleId == null) {
            String styleNo = order.getStyleNo() == null ? null : order.getStyleNo().trim();
            if (styleNo != null && !styleNo.isEmpty()) {
                StyleInfo styleInfo = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getStyleNo, styleNo)
                        .last("limit 1"));
                if (styleInfo != null && styleInfo.getId() != null) {
                    styleId = styleInfo.getId();
                }
            }
        }

        if (styleId != null) {
            styleQuotation = styleQuotationService.getByStyleId(styleId);
        }
        if (styleQuotation != null) {
            if (styleQuotation.getTotalCost() != null) {
                quotationUnitCost = nonNeg(styleQuotation.getTotalCost());
            }
            if (styleQuotation.getTotalPrice() != null) {
                quotationUnitPrice = nonNeg(styleQuotation.getTotalPrice());
            }
        }

        if (quotationUnitPrice.compareTo(BigDecimal.ZERO) <= 0 && styleId != null && styleQuotationService != null) {
            try {
                Set<Long> one = new HashSet<>();
                one.add(styleId);
                Map<Long, String> styleNoByStyleId = new HashMap<>();
                String styleNo = order.getStyleNo() == null ? null : order.getStyleNo().trim();
                if (styleNo != null && !styleNo.isEmpty()) {
                    styleNoByStyleId.put(styleId, styleNo);
                }
                BigDecimal fallback = styleQuotationService.resolveFinalUnitPriceByStyleIds(one, styleNoByStyleId)
                        .get(styleId);
                if (fallback != null && fallback.compareTo(BigDecimal.ZERO) > 0) {
                    quotationUnitPrice = nonNeg(fallback);
                }
            } catch (Exception ignored) {
            }
        }

        boolean hasQuotationPrice = quotationUnitPrice.compareTo(BigDecimal.ZERO) > 0;
        boolean hasWarehousing = warehousingQty > 0;
        String calcBasis = hasWarehousing ? "warehousing" : "order";
        int baseQty = hasWarehousing ? warehousingQty : Math.max(0, orderQty);

        BigDecimal processingUnitPrice = BigDecimal.ZERO;
        try {
            if (templateLibraryService != null && order.getStyleNo() != null && !order.getStyleNo().trim().isEmpty()) {
                BigDecimal v = templateLibraryService.resolveTotalUnitPriceFromProgressTemplate(order.getStyleNo().trim());
                if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                    processingUnitPrice = v;
                }
            }
        } catch (Exception ignored) {
        }
        processingCost = nonNeg(processingUnitPrice).multiply(BigDecimal.valueOf(Math.max(0, baseQty)));

        BigDecimal warehousingRevenue = hasQuotationPrice
                ? quotationUnitPrice.multiply(BigDecimal.valueOf(Math.max(0, warehousingQty)))
                : BigDecimal.ZERO;
        BigDecimal revenue = (hasQuotationPrice && baseQty > 0)
                ? quotationUnitPrice.multiply(BigDecimal.valueOf(baseQty))
                : BigDecimal.ZERO;

        BigDecimal profit = revenue.subtract(materialPlannedCost).subtract(processingCost);
        BigDecimal unitRevenue = safeDivide(revenue, baseQty);
        BigDecimal actualUnitCost = safeDivide(materialPlannedCost.add(processingCost), baseQty);
        BigDecimal unitProfit = safeDivide(profit, baseQty);
        BigDecimal marginPercent = BigDecimal.ZERO;
        if (revenue.compareTo(BigDecimal.ZERO) > 0) {
            marginPercent = profit.multiply(BigDecimal.valueOf(100)).divide(revenue, 2, RoundingMode.HALF_UP);
        }

        BigDecimal quotationTotalCost = quotationUnitCost.multiply(BigDecimal.valueOf(Math.max(0, baseQty)));
        BigDecimal quotationTotalPrice = quotationUnitPrice.multiply(BigDecimal.valueOf(Math.max(0, baseQty)));

        BigDecimal unitCost = quotationUnitCost.compareTo(BigDecimal.ZERO) > 0 ? quotationUnitCost : actualUnitCost;

        BigDecimal incurredCost = materialArrivedCost.add(processingCostPaid);

        TreeMap<LocalDate, DayAgg> byDay = new TreeMap<>();
        if (purchases != null) {
            for (MaterialPurchase p : purchases) {
                if (p == null) {
                    continue;
                }
                String st = p.getStatus() == null ? "" : p.getStatus().trim();
                if ("cancelled".equalsIgnoreCase(st)) {
                    continue;
                }
                LocalDateTime t = firstTime(p.getReceivedTime(), p.getUpdateTime(), p.getCreateTime());
                LocalDate d = (t == null ? null : t.toLocalDate());
                if (d == null) {
                    continue;
                }

                BigDecimal amt = null;
                BigDecimal up = p.getUnitPrice();
                if (up != null) {
                    int pq = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity();
                    int aq = p.getArrivedQuantity() == null ? 0 : p.getArrivedQuantity();
                    int eff = materialPurchaseService.computeEffectiveArrivedQuantity(pq, aq);
                    if (eff <= 0) {
                        continue;
                    }
                    amt = up.multiply(BigDecimal.valueOf(eff));
                } else {
                    BigDecimal ta = p.getTotalAmount();
                    if (ta == null || ta.compareTo(BigDecimal.ZERO) <= 0) {
                        continue;
                    }
                    amt = ta;
                }

                DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                agg.materialArrived = agg.materialArrived.add(amt);
            }
        }

        if (processingCost.compareTo(BigDecimal.ZERO) > 0) {
            LocalDateTime t = firstTime(order.getCreateTime(), order.getUpdateTime(), null);
            LocalDate d = (t == null ? null : t.toLocalDate());
            if (d != null) {
                DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                agg.processing = agg.processing.add(processingCost);
            }
        }

        boolean useWarehousingRevenue = hasWarehousing && hasQuotationPrice;
        if (useWarehousingRevenue) {
            if (warehousings != null) {
                for (ProductWarehousing w : warehousings) {
                    if (w == null) {
                        continue;
                    }
                    LocalDateTime t = firstTime(w.getCreateTime(), w.getUpdateTime(), null);
                    LocalDate d = (t == null ? null : t.toLocalDate());
                    if (d == null) {
                        continue;
                    }
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q <= 0) {
                        continue;
                    }
                    BigDecimal amt = quotationUnitPrice.multiply(BigDecimal.valueOf(q));
                    DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                    agg.revenue = agg.revenue.add(nonNeg(amt));
                }
            }
        } else {
            if (hasQuotationPrice && orderQty > 0) {
                LocalDateTime t = firstTime(order.getCreateTime(), order.getUpdateTime(), null);
                LocalDate d = (t == null ? null : t.toLocalDate());
                if (d != null) {
                    DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                    agg.revenue = agg.revenue.add(nonNeg(quotationUnitPrice.multiply(BigDecimal.valueOf(orderQty))));
                }
            }
        }

        ArrayList<Map<String, Object>> timeline = new ArrayList<>();
        BigDecimal cumMat = BigDecimal.ZERO;
        BigDecimal cumProc = BigDecimal.ZERO;
        BigDecimal cumRev = BigDecimal.ZERO;
        DateTimeFormatter df = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (Map.Entry<LocalDate, DayAgg> e : byDay.entrySet()) {
            if (e == null || e.getKey() == null) {
                continue;
            }
            DayAgg a = e.getValue() == null ? new DayAgg() : e.getValue();
            cumMat = cumMat.add(nonNeg(a.materialArrived));
            cumProc = cumProc.add(nonNeg(a.processing));
            cumRev = cumRev.add(nonNeg(a.revenue));
            BigDecimal cumProfit = cumRev.subtract(cumMat).subtract(cumProc);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", e.getKey().format(df));
            row.put("materialArrivedCost", scale2(nonNeg(a.materialArrived)));
            row.put("processingCost", scale2(nonNeg(a.processing)));
            row.put("revenue", scale2(nonNeg(a.revenue)));
            row.put("cumMaterialArrivedCost", scale2(nonNeg(cumMat)));
            row.put("cumProcessingCost", scale2(nonNeg(cumProc)));
            row.put("cumRevenue", scale2(nonNeg(cumRev)));
            row.put("cumProfit", scale2(cumProfit));
            timeline.add(row);
        }

        Map<String, Object> orderInfo = new LinkedHashMap<>();
        orderInfo.put("orderId", order.getId());
        orderInfo.put("orderNo", order.getOrderNo());
        orderInfo.put("styleNo", order.getStyleNo());
        orderInfo.put("styleName", order.getStyleName());
        orderInfo.put("color", order.getColor());
        orderInfo.put("factoryName", order.getFactoryName());
        orderInfo.put("quantity", orderQty);
        orderInfo.put("completedQuantity", order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity());
        orderInfo.put("warehousingQuantity", warehousingQty);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("revenue", scale2(revenue));
        summary.put("warehousingRevenue", scale2(warehousingRevenue));
        summary.put("shipmentRevenue", scale2(shipmentRevenue));
        summary.put("profitReady", hasWarehousing);
        summary.put("calcBasis", calcBasis);
        summary.put("calcQty", baseQty);
        summary.put("materialPlannedQty", materialStats == null ? 0 : materialStats.getPlannedQty());
        summary.put("materialArrivedQty", materialStats == null ? 0 : materialStats.getArrivedQty());
        summary.put("materialEffectiveArrivedQty", materialStats == null ? 0 : materialStats.getEffectiveArrivedQty());
        summary.put("materialArrivalRate", materialStats == null ? 0 : materialStats.getArrivalRate());
        summary.put("materialPlannedCost", scale2(materialPlannedCost));
        summary.put("materialArrivedCost", scale2(materialArrivedCost));
        summary.put("processingCost", scale2(processingCost));
        summary.put("processingCostPaid", scale2(processingCostPaid));
        summary.put("shipmentRevenueTotal", scale2(shipmentRevenueTotal));
        summary.put("incurredCost", scale2(incurredCost));
        summary.put("profit", scale2(profit));
        summary.put("unitRevenue", scale2(unitRevenue));
        summary.put("unitCost", scale2(unitCost));
        summary.put("actualUnitCost", scale2(actualUnitCost));
        summary.put("unitProfit", scale2(unitProfit));
        summary.put("marginPercent", marginPercent);
        summary.put("quotationUnitCost", scale2(quotationUnitCost));
        summary.put("quotationTotalCost", scale2(quotationTotalCost));
        summary.put("quotationUnitPrice", scale2(quotationUnitPrice));
        summary.put("quotationTotalPrice", scale2(quotationTotalPrice));

        Map<String, Object> data = new HashMap<>();
        data.put("order", orderInfo);
        data.put("summary", summary);
        data.put("materials", purchases == null ? new ArrayList<>() : purchases);
        data.put("factories", new ArrayList<>());
        data.put("shipments", shipmentRecs == null ? new ArrayList<>() : shipmentRecs);
        data.put("timeline", timeline);

        return Result.success(data);
    }

    private static BigDecimal safeDivide(BigDecimal v, int divisor) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        if (divisor <= 0) {
            return BigDecimal.ZERO;
        }
        return v.divide(BigDecimal.valueOf(divisor), 4, RoundingMode.HALF_UP);
    }

    private static BigDecimal nonNeg(BigDecimal v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        return v.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : v;
    }

    private static BigDecimal amountPreferFinal(BigDecimal finalAmount, BigDecimal totalAmount) {
        if (finalAmount != null) {
            return finalAmount;
        }
        return totalAmount == null ? BigDecimal.ZERO : totalAmount;
    }

    private static BigDecimal scale2(BigDecimal v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private static LocalDateTime firstTime(LocalDateTime a, LocalDateTime b, LocalDateTime c) {
        if (a != null) {
            return a;
        }
        if (b != null) {
            return b;
        }
        return c;
    }

    private static class DayAgg {
        private BigDecimal materialArrived = BigDecimal.ZERO;
        private BigDecimal processing = BigDecimal.ZERO;
        private BigDecimal revenue = BigDecimal.ZERO;
    }
}
