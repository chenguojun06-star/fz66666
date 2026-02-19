package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 订单利润分析编排器
 * <p>
 * 编排跨服务调用：生产订单、物料采购、成品入库、出货对账、款式报价、模板工价
 * 从 ReconciliationCompatController.orderProfit 方法提取
 */
@Slf4j
@Service
public class OrderProfitOrchestrator {

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

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private SecondaryProcessService secondaryProcessService;

    /**
     * 计算订单利润分析数据
     *
     * @param orderId 订单ID（可选）
     * @param orderNo 订单号（可选）
     * @return 利润分析结果（包含 order, summary, materials, shipments, timeline）
     */
    public Map<String, Object> computeOrderProfit(String orderId, String orderNo) {
        String oid = orderId == null ? null : orderId.trim();
        String ono = orderNo == null ? null : orderNo.trim();
        if ((oid == null || oid.isEmpty()) && (ono == null || ono.isEmpty())) {
            throw new IllegalArgumentException("orderId或orderNo不能为空");
        }

        // 1. 查询订单
        ProductionOrder order = resolveOrder(oid, ono);

        String resolvedOrderId = order.getId() == null ? null : order.getId().trim();
        if (resolvedOrderId == null || resolvedOrderId.isEmpty()) {
            throw new java.util.NoSuchElementException("订单不存在");
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();

        // 2. 查询入库数据
        List<ProductWarehousing> warehousings = productWarehousingService
                .list(new LambdaQueryWrapper<ProductWarehousing>()
                        .eq(ProductWarehousing::getOrderId, resolvedOrderId)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByDesc(ProductWarehousing::getCreateTime));
        int warehousingQty = computeWarehousingQty(warehousings);

        // 3. 查询采购数据
        List<MaterialPurchase> purchases = materialPurchaseService
                .list(new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, resolvedOrderId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .orderByDesc(MaterialPurchase::getCreateTime));

        // 4. 查询出货对账
        List<ShipmentReconciliation> shipmentRecs = shipmentReconciliationService
                .list(new LambdaQueryWrapper<ShipmentReconciliation>()
                        .eq(ShipmentReconciliation::getOrderId, resolvedOrderId)
                        .orderByDesc(ShipmentReconciliation::getCreateTime));

        // 5. 计算物料成本
        MaterialPurchaseService.ArrivalStats materialStats = materialPurchaseService.computeArrivalStats(purchases);
        BigDecimal materialPlannedCost = materialStats == null || materialStats.getPlannedAmount() == null
                ? BigDecimal.ZERO : materialStats.getPlannedAmount();
        BigDecimal materialArrivedCost = materialStats == null || materialStats.getArrivedAmount() == null
                ? BigDecimal.ZERO : materialStats.getArrivedAmount();

        // 6. 计算出货收入
        BigDecimal[] shipmentAmounts = computeShipmentAmounts(shipmentRecs);
        BigDecimal shipmentRevenue = shipmentAmounts[0];
        BigDecimal shipmentRevenueTotal = shipmentAmounts[1];

        // 7. 报价信息
        Long styleId = resolveStyleId(order);
        StyleQuotation styleQuotation = styleId != null ? styleQuotationService.getByStyleId(styleId) : null;
        BigDecimal quotationUnitCost = BigDecimal.ZERO;
        BigDecimal quotationUnitPrice = BigDecimal.ZERO;

        // 实时从 BOM + 工序 + 二次工艺计算真实成本（不依赖报价单中可能过时的 material_cost/total_price）
        if (styleId != null) {
            BigDecimal profitRate = (styleQuotation != null && styleQuotation.getProfitRate() != null)
                    ? styleQuotation.getProfitRate() : BigDecimal.ZERO;
            BigDecimal freshCost = computeLiveFreshCost(styleId);
            if (freshCost.compareTo(BigDecimal.ZERO) > 0) {
                quotationUnitCost = freshCost;
                BigDecimal multiplier = BigDecimal.ONE.add(profitRate.movePointLeft(2));
                quotationUnitPrice = freshCost.multiply(multiplier).setScale(2, java.math.RoundingMode.HALF_UP);
            } else if (styleQuotation != null) {
                // 降级：使用报价单存储值（BOM 为空时的兜底）
                if (styleQuotation.getTotalCost() != null) {
                    quotationUnitCost = nonNeg(styleQuotation.getTotalCost());
                }
                if (styleQuotation.getTotalPrice() != null) {
                    quotationUnitPrice = nonNeg(styleQuotation.getTotalPrice());
                }
            }
        }

        // 报价回退：从模板库获取
        if (quotationUnitPrice.compareTo(BigDecimal.ZERO) <= 0 && styleId != null) {
            quotationUnitPrice = resolveFallbackUnitPrice(styleId, order);
        }

        // 8. 加工成本
        boolean hasQuotationPrice = quotationUnitPrice.compareTo(BigDecimal.ZERO) > 0;
        boolean hasWarehousing = warehousingQty > 0;
        String calcBasis = hasWarehousing ? "warehousing" : "order";
        int baseQty = hasWarehousing ? warehousingQty : Math.max(0, orderQty);

        BigDecimal processingUnitPrice = resolveProcessingUnitPrice(order);
        BigDecimal processingCost = nonNeg(processingUnitPrice).multiply(BigDecimal.valueOf(Math.max(0, baseQty)));
        BigDecimal processingCostPaid = BigDecimal.ZERO;

        // 9. 收入与利润计算
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

        // 10. 时间轴
        List<Map<String, Object>> timeline = buildTimeline(
                purchases, warehousings, order,
                processingCost, quotationUnitPrice,
                hasWarehousing, hasQuotationPrice, orderQty);

        // 11. 组装返回数据
        Map<String, Object> orderInfo = buildOrderInfo(order, orderQty, warehousingQty);

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

        return data;
    }

    // ========================== 私有辅助方法 ==========================

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        ProductionOrder order;
        if (orderId != null && !orderId.isEmpty()) {
            order = productionOrderService.getById(orderId);
        } else {
            order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, orderNo)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("limit 1"));
        }
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new java.util.NoSuchElementException("订单不存在");
        }
        return order;
    }

    private int computeWarehousingQty(List<ProductWarehousing> warehousings) {
        if (warehousings == null) {
            return 0;
        }
        long sum = 0;
        for (ProductWarehousing w : warehousings) {
            if (w == null) continue;
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q > 0) sum += q;
        }
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0, sum));
    }

    private BigDecimal[] computeShipmentAmounts(List<ShipmentReconciliation> shipmentRecs) {
        BigDecimal shipmentRevenue = BigDecimal.ZERO;
        BigDecimal shipmentRevenueTotal = BigDecimal.ZERO;
        if (shipmentRecs != null) {
            for (ShipmentReconciliation r : shipmentRecs) {
                if (r == null) continue;
                BigDecimal amt = nonNeg(amountPreferFinal(r.getFinalAmount(), r.getTotalAmount()));
                shipmentRevenueTotal = shipmentRevenueTotal.add(amt);
                String st = r.getStatus() == null ? "" : r.getStatus().trim();
                if ("paid".equalsIgnoreCase(st)) {
                    shipmentRevenue = shipmentRevenue.add(amt);
                }
            }
        }
        return new BigDecimal[]{shipmentRevenue, shipmentRevenueTotal};
    }

    private Long resolveStyleId(ProductionOrder order) {
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
        return styleId;
    }

    /**
     * 实时计算款式的真实成本（BOM + 工序 + 二次工艺），不使用报价单中可能过时的存储值
     */
    private BigDecimal computeLiveFreshCost(Long styleId) {
        BigDecimal total = BigDecimal.ZERO;
        try {
            List<StyleBom> boms = styleBomService.lambdaQuery()
                    .eq(StyleBom::getStyleId, styleId).list();
            if (boms != null) {
                for (StyleBom b : boms) {
                    if (b == null) continue;
                    BigDecimal item = b.getTotalPrice();
                    if (item == null || item.compareTo(BigDecimal.ZERO) <= 0) {
                        BigDecimal usage = b.getUsageAmount() != null ? b.getUsageAmount() : BigDecimal.ZERO;
                        BigDecimal loss  = b.getLossRate()    != null ? b.getLossRate()    : BigDecimal.ZERO;
                        BigDecimal unit  = b.getUnitPrice()   != null ? b.getUnitPrice()   : BigDecimal.ZERO;
                        item = usage.multiply(BigDecimal.ONE.add(loss.movePointLeft(2))).multiply(unit);
                    }
                    if (item != null && item.compareTo(BigDecimal.ZERO) > 0) {
                        total = total.add(item);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("computeLiveFreshCost: BOM query failed for styleId={}", styleId, e);
        }
        try {
            List<StyleProcess> processes = styleProcessService.lambdaQuery()
                    .eq(StyleProcess::getStyleId, styleId).list();
            if (processes != null) {
                for (StyleProcess p : processes) {
                    if (p == null || p.getPrice() == null) continue;
                    if (p.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                        total = total.add(p.getPrice());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("computeLiveFreshCost: Process query failed for styleId={}", styleId, e);
        }
        try {
            List<SecondaryProcess> secondaries = secondaryProcessService.lambdaQuery()
                    .eq(SecondaryProcess::getStyleId, styleId).list();
            if (secondaries != null) {
                for (SecondaryProcess s : secondaries) {
                    if (s == null || s.getTotalPrice() == null) continue;
                    if (s.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                        total = total.add(s.getTotalPrice());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("computeLiveFreshCost: Secondary process query failed for styleId={}", styleId, e);
        }
        return total.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal resolveFallbackUnitPrice(Long styleId, ProductionOrder order) {
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
                return nonNeg(fallback);
            }
        } catch (Exception ignored) {
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal resolveProcessingUnitPrice(ProductionOrder order) {
        try {
            if (templateLibraryService != null && order.getStyleNo() != null && !order.getStyleNo().trim().isEmpty()) {
                BigDecimal v = templateLibraryService.resolveTotalUnitPriceFromProgressTemplate(order.getStyleNo().trim());
                if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                    return v;
                }
            }
        } catch (Exception ignored) {
        }
        return BigDecimal.ZERO;
    }

    private List<Map<String, Object>> buildTimeline(
            List<MaterialPurchase> purchases,
            List<ProductWarehousing> warehousings,
            ProductionOrder order,
            BigDecimal processingCost,
            BigDecimal quotationUnitPrice,
            boolean hasWarehousing,
            boolean hasQuotationPrice,
            int orderQty) {

        TreeMap<LocalDate, DayAgg> byDay = new TreeMap<>();

        // 采购数据按天聚合
        if (purchases != null) {
            for (MaterialPurchase p : purchases) {
                if (p == null) continue;
                String st = p.getStatus() == null ? "" : p.getStatus().trim();
                if ("cancelled".equalsIgnoreCase(st)) continue;
                LocalDateTime t = firstTime(p.getReceivedTime(), p.getUpdateTime(), p.getCreateTime());
                LocalDate d = (t == null ? null : t.toLocalDate());
                if (d == null) continue;

                BigDecimal amt = null;
                BigDecimal up = p.getUnitPrice();
                if (up != null) {
                    int pq = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity();
                    int aq = p.getArrivedQuantity() == null ? 0 : p.getArrivedQuantity();
                    int eff = materialPurchaseService.computeEffectiveArrivedQuantity(pq, aq);
                    if (eff <= 0) continue;
                    amt = up.multiply(BigDecimal.valueOf(eff));
                } else {
                    BigDecimal ta = p.getTotalAmount();
                    if (ta == null || ta.compareTo(BigDecimal.ZERO) <= 0) continue;
                    amt = ta;
                }

                DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                agg.materialArrived = agg.materialArrived.add(amt);
            }
        }

        // 加工成本
        if (processingCost.compareTo(BigDecimal.ZERO) > 0) {
            LocalDateTime t = firstTime(order.getCreateTime(), order.getUpdateTime(), null);
            LocalDate d = (t == null ? null : t.toLocalDate());
            if (d != null) {
                DayAgg agg = byDay.computeIfAbsent(d, k -> new DayAgg());
                agg.processing = agg.processing.add(processingCost);
            }
        }

        // 收入按天聚合
        boolean useWarehousingRevenue = hasWarehousing && hasQuotationPrice;
        if (useWarehousingRevenue) {
            if (warehousings != null) {
                for (ProductWarehousing w : warehousings) {
                    if (w == null) continue;
                    LocalDateTime t = firstTime(w.getCreateTime(), w.getUpdateTime(), null);
                    LocalDate d = (t == null ? null : t.toLocalDate());
                    if (d == null) continue;
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q <= 0) continue;
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

        // 构建时间线
        ArrayList<Map<String, Object>> timeline = new ArrayList<>();
        BigDecimal cumMat = BigDecimal.ZERO;
        BigDecimal cumProc = BigDecimal.ZERO;
        BigDecimal cumRev = BigDecimal.ZERO;
        DateTimeFormatter df = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        for (Map.Entry<LocalDate, DayAgg> e : byDay.entrySet()) {
            if (e == null || e.getKey() == null) continue;
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
        return timeline;
    }

    private Map<String, Object> buildOrderInfo(ProductionOrder order, int orderQty, int warehousingQty) {
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
        return orderInfo;
    }

    // ========================== 工具方法 ==========================

    private static BigDecimal safeDivide(BigDecimal v, int divisor) {
        if (v == null || divisor <= 0) return BigDecimal.ZERO;
        return v.divide(BigDecimal.valueOf(divisor), 4, RoundingMode.HALF_UP);
    }

    private static BigDecimal nonNeg(BigDecimal v) {
        if (v == null) return BigDecimal.ZERO;
        return v.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : v;
    }

    private static BigDecimal amountPreferFinal(BigDecimal finalAmount, BigDecimal totalAmount) {
        if (finalAmount != null) return finalAmount;
        return totalAmount == null ? BigDecimal.ZERO : totalAmount;
    }

    private static BigDecimal scale2(BigDecimal v) {
        if (v == null) return BigDecimal.ZERO;
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    private static LocalDateTime firstTime(LocalDateTime a, LocalDateTime b, LocalDateTime c) {
        if (a != null) return a;
        if (b != null) return b;
        return c;
    }

    private static class DayAgg {
        private BigDecimal materialArrived = BigDecimal.ZERO;
        private BigDecimal processing = BigDecimal.ZERO;
        private BigDecimal revenue = BigDecimal.ZERO;
    }
}
