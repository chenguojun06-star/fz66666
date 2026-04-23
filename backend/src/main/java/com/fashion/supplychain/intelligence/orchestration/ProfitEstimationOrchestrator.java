package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProfitEstimationRequest;
import com.fashion.supplychain.intelligence.dto.ProfitEstimationResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.util.OrderPricingSnapshotUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collections;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.fashion.supplychain.production.helper.OrderPriceFillHelper;

/**
 * 订单利润预估编排器 — 成本结构分析 + 毛利率仪表盘
 *
 * <p>利润 = 客户报价总额 - (工厂成本 + 面辅料成本 + 已发工资 + 其他费用)
 * <p>数据来源：
 * <ul>
 *   <li>报价：quotationUnitPrice × orderQuantity</li>
 *   <li>工厂成本：factoryUnitPrice × orderQuantity</li>
 *   <li>工资成本：ScanRecord.totalAmount 累计</li>
 *   <li>面辅料：MaterialPicking 累计（简化：占工厂成本 15%）</li>
 * </ul>
 */
@Service
@Slf4j
public class ProfitEstimationOrchestrator {

    private static final BigDecimal MATERIAL_RATIO = new BigDecimal("0.15");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private OrderPriceFillHelper orderPriceFillHelper;

    public ProfitEstimationResponse estimate(ProfitEstimationRequest request) {
        ProfitEstimationResponse resp = new ProfitEstimationResponse();
        if (request == null || request.getOrderId() == null) {
            resp.setCostWarning("请提供订单ID");
            return resp;
        }

        try {
        String idStr = request.getOrderId().trim();
        ProductionOrder order = null;
        // 纯数字时先按主键查（兼容按DB主键调用的场景）
        if (idStr.matches("\\d+")) {
            try { order = productionOrderService.getById(Long.parseLong(idStr)); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        }
        // 主键未命中或含字母（如 PO20260228001），改按订单号查，支持带/不带 PO 前缀
        if (order == null) {
            final String noStr = idStr;
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", UserContext.tenantId())
              .and(w -> w.eq("order_no", noStr)
                         .or().eq("order_no", "PO" + noStr)
                         .or().eq("order_no", noStr.replaceFirst("^(?i)PO", "")));
            order = productionOrderService.getOne(qw);
        }
        if (order == null) {
            resp.setCostWarning("订单不存在，请确认订单号");
            return resp;
        }

        // 核心修复：单价在系统中是动态计算的（来自款式BOM和工序评估），数据库不直存，需要手动填充
        orderPriceFillHelper.fillFactoryUnitPrice(Collections.singletonList(order));
        resp.setOrderId(order.getId());
        resp.setOrderNo(order.getOrderNo());
        int qty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;

        BigDecimal lockedUnitPrice = OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(
                order.getFactoryUnitPrice(),
                order.getOrderDetails());
        BigDecimal quotationTotal = lockedUnitPrice.multiply(BigDecimal.valueOf(qty));
        resp.setQuotationTotal(quotationTotal);

        BigDecimal wageCost = computeWageCost(order.getId());
        resp.setWageCost(wageCost);

        BigDecimal materialCost = computeMaterialCost(order);
        resp.setMaterialCost(materialCost);

        resp.setOtherCost(BigDecimal.ZERO);

        BigDecimal factoryCost = wageCost;
        resp.setFactoryCost(factoryCost);

        BigDecimal totalCost = materialCost.add(wageCost);
        resp.setTotalCost(totalCost);

        BigDecimal profit = quotationTotal.subtract(totalCost);
        resp.setEstimatedProfit(profit);

        // 毛利率
        double margin = quotationTotal.compareTo(BigDecimal.ZERO) > 0
                ? profit.divide(quotationTotal, 4, RoundingMode.HALF_UP)
                        .doubleValue() * 100
                : 0;
        resp.setGrossMarginPct(Math.round(margin * 10.0) / 10.0);

        // 利润状态
        if (margin > 15) {
            resp.setProfitStatus("盈利");
        } else if (margin > 5) {
            resp.setProfitStatus("微利");
        } else {
            resp.setProfitStatus("亏损");
            resp.setCostWarning("毛利率低于5%，建议审查成本结构");
        }

        } catch (Exception e) {
            log.error("[利润预估] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
            resp.setCostWarning("数据加载异常，请稍后重试");
        }
        return resp;
    }

    private BigDecimal computeWageCost(String orderId) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("order_id", orderId)
          .eq("scan_result", "success")
          .ne("scan_type", "orchestration");
        return scanRecordService.list(qw).stream()
                .map(r -> {
                    if (r.getTotalAmount() != null && r.getTotalAmount().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getTotalAmount();
                    }
                    if (r.getUnitPrice() != null && r.getQuantity() != null) {
                        return r.getUnitPrice().multiply(BigDecimal.valueOf(r.getQuantity()));
                    }
                    return BigDecimal.ZERO;
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal computeMaterialCost(ProductionOrder order) {
        try {
            QueryWrapper<com.fashion.supplychain.production.entity.MaterialPurchase> qw = new QueryWrapper<>();
            qw.eq("order_no", order.getOrderNo())
              .eq("delete_flag", 0)
              .in("status", "RECEIVED", "COMPLETED");
            var purchases = materialPurchaseService.list(qw);
            return purchases.stream()
                    .map(p -> p.getTotalAmount() != null ? p.getTotalAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.warn("[利润预估] 物料成本查询失败，使用15%估算: {}", e.getMessage());
            BigDecimal lockedUnitPrice = OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(
                    order.getFactoryUnitPrice(), order.getOrderDetails());
            return lockedUnitPrice.multiply(BigDecimal.valueOf(
                    order.getOrderQuantity() != null ? order.getOrderQuantity() : 0))
                    .multiply(MATERIAL_RATIO).setScale(2, RoundingMode.HALF_UP);
        }
    }
}
