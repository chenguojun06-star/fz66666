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
public class DelayRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.DELAY; }

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of(
            "completed", "cancelled", "scrapped", "archived", "closed"
    );

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 2000"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            String status = o.getStatus() != null ? o.getStatus() : "";
            String slaStatus = o.getDeliverySlaStatus() != null ? o.getDeliverySlaStatus() : "";
            if (slaStatus.contains("DELAYED") || slaStatus.contains("OVERDUE")
                    || status.contains("延期") || status.contains("OVERDUE")) {
                RiskItem item = RiskItem.create(RiskType.DELAY, "HIGH", 85.0);
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 已延期 (SLA状态: " + slaStatus + ")");
                item.setSuggestedAction("立即联系工厂确认进度，评估交付方案");
                item.getMetadata().put("slaStatus", slaStatus);
                item.getMetadata().put("status", status);
                items.add(item);
            } else if (slaStatus.contains("URGENT") || slaStatus.contains("AT_RISK")) {
                RiskItem item = RiskItem.create(RiskType.DELAY, "MEDIUM", 60.0);
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 临近交期 (SLA: " + slaStatus + ")");
                item.setSuggestedAction("催办工厂加快进度，提前准备出货");
                item.getMetadata().put("slaStatus", slaStatus);
                items.add(item);
            }
        }
        return items;
    }
}
