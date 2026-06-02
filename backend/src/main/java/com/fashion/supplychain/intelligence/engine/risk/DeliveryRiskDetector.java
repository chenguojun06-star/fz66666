package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class DeliveryRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.DELIVERY; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            String status = o.getStatus() != null ? o.getStatus() : "";
            String remarks = o.getRemarks() != null ? o.getRemarks() : "";
            boolean deliveryIssue = status.contains("物流异常") || status.contains("DELIVERY_EXCEPTION")
                    || status.contains("退货") || status.contains("RETURNED")
                    || remarks.contains("物流问题") || remarks.contains("丢件") || remarks.contains("破损");
            if (deliveryIssue) {
                RiskItem item = RiskItem.create(RiskType.DELIVERY, "HIGH", 75.0);
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 交付异常：" + status);
                item.setSuggestedAction("联系物流公司核实状态，准备补发方案");
                item.getMetadata().put("status", status);
                items.add(item);
            }
        }
        return items;
    }
}
