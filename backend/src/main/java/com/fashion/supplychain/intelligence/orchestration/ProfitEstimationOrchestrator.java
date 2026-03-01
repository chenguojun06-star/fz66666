package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ProfitEstimationRequest;
import com.fashion.supplychain.intelligence.dto.ProfitEstimationResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    public ProfitEstimationResponse estimate(ProfitEstimationRequest request) {
        ProfitEstimationResponse resp = new ProfitEstimationResponse();
        if (request == null || request.getOrderId() == null) {
            resp.setCostWarning("请提供订单ID");
            return resp;
        }

        try {
        ProductionOrder order = productionOrderService.getById(request.getOrderId());
        if (order == null) {
            resp.setCostWarning("订单不存在");
            return resp;
        }

        resp.setOrderId(Long.parseLong(order.getId()));
        resp.setOrderNo(order.getOrderNo());
        int qty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;

        // 客户报价总额
        BigDecimal quoteUnit = order.getQuotationUnitPrice() != null
                ? order.getQuotationUnitPrice() : BigDecimal.ZERO;
        BigDecimal quotationTotal = quoteUnit.multiply(BigDecimal.valueOf(qty));
        resp.setQuotationTotal(quotationTotal);

        // 工厂成本
        BigDecimal factoryUnit = order.getFactoryUnitPrice() != null
                ? order.getFactoryUnitPrice() : BigDecimal.ZERO;
        BigDecimal factoryCost = factoryUnit.multiply(BigDecimal.valueOf(qty));
        resp.setFactoryCost(factoryCost);

        // 面辅料成本（简化估算）
        BigDecimal materialCost = factoryCost.multiply(MATERIAL_RATIO)
                .setScale(2, RoundingMode.HALF_UP);
        resp.setMaterialCost(materialCost);

        // 已发工资（累计 scan record totalAmount）
        BigDecimal wageCost = computeWageCost(order.getId());
        resp.setWageCost(wageCost);

        // 其他费用（简化为0）
        resp.setOtherCost(BigDecimal.ZERO);

        // 总成本
        BigDecimal totalCost = factoryCost.add(materialCost).add(wageCost);
        resp.setTotalCost(totalCost);

        // 利润
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
          .eq("scan_result", "success");
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
}
