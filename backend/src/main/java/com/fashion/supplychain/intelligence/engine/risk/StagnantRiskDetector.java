package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Component
@Lazy
@RequiredArgsConstructor
public class StagnantRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.STAGNANT; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                                ProductionOrder::getStatus, ProductionOrder::getUpdateTime,
                                ProductionOrder::getFactoryId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        for (ProductionOrder o : orders) {
            String status = o.getStatus() != null ? o.getStatus() : "";
            if (status.contains("已完成") || status.contains("已交付") || status.contains("已关闭")
                    || status.contains("已报废") || status.contains("COMPLETED")
                    || status.contains("CLOSED") || status.contains("SCRAPPED")) continue;

            LocalDateTime lastUpdate = o.getUpdateTime();
            if (lastUpdate == null) continue;
            // P0修复：按小时判定，停滞≥24小时即触发（原为≥7天）
            long stagnantHours = ChronoUnit.HOURS.between(lastUpdate, LocalDateTime.now());
            if (stagnantHours >= 24) {
                String severity = stagnantHours >= 72 ? "CRITICAL"
                        : stagnantHours >= 48 ? "HIGH" : "MEDIUM";
                RiskItem item = RiskItem.create(RiskType.STAGNANT, severity,
                        Math.min(100, 50 + stagnantHours * 0.5));
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 已停滞 " + stagnantHours + " 小时无更新");
                item.setSuggestedAction("电话催办工厂进度，必要时安排现场跟单");
                item.getMetadata().put("stagnantHours", stagnantHours);
                item.getMetadata().put("lastUpdate", lastUpdate.toString());
                items.add(item);
            }
        }
        return items;
    }
}
