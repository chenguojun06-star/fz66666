package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

@Component
@Lazy
@RequiredArgsConstructor
public class CostRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.COST; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                                ProductionOrder::getFactoryUnitPrice, ProductionOrder::getFactoryId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            java.math.BigDecimal quotation = o.getQuotationUnitPrice();
            java.math.BigDecimal actual = o.getFactoryUnitPrice();
            if (quotation == null || actual == null) continue;
            if (quotation.signum() <= 0) continue;
            double ratio = actual.divide(quotation, 4, java.math.RoundingMode.HALF_UP).doubleValue();
            if (ratio > 1.10) {
                String severity = ratio > 1.30 ? "CRITICAL" : ratio > 1.20 ? "HIGH" : "MEDIUM";
                RiskItem item = RiskItem.create(RiskType.COST, severity, Math.min(100, 60 + (ratio - 1.0) * 200));
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 工厂报价超出预算 "
                        + String.format("%.1f", (ratio - 1) * 100) + "%");
                item.setSuggestedAction("核查成本明细，联系工厂协商分摊或调整报价");
                item.getMetadata().put("quotationUnitPrice", quotation);
                item.getMetadata().put("factoryUnitPrice", actual);
                item.getMetadata().put("overrunRatio", ratio);
                items.add(item);
            }
        }
        return items;
    }
}
