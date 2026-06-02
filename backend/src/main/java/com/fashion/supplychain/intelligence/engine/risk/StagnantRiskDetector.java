package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class StagnantRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.STAGNANT; }

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
            if (status.contains("已完成") || status.contains("已交付") || status.contains("已关闭")
                    || status.contains("已报废") || status.contains("COMPLETED")
                    || status.contains("CLOSED") || status.contains("SCRAPPED")) continue;

            LocalDateTime lastUpdate = o.getUpdateTime();
            if (lastUpdate == null) continue;
            long stagnantDays = ChronoUnit.DAYS.between(lastUpdate, LocalDateTime.now());
            if (stagnantDays >= 7) {
                String severity = stagnantDays >= 21 ? "CRITICAL"
                        : stagnantDays >= 14 ? "HIGH" : "MEDIUM";
                RiskItem item = RiskItem.create(RiskType.STAGNANT, severity,
                        Math.min(100, 50 + stagnantDays * 2.0));
                item.setOrderId(o.getId());
                item.setFactoryId(o.getFactoryId());
                item.setDescription("订单 " + o.getOrderNo() + " 已停滞 " + stagnantDays + " 天无更新");
                item.setSuggestedAction("电话催办工厂进度，必要时安排现场跟单");
                item.getMetadata().put("stagnantDays", stagnantDays);
                item.getMetadata().put("lastUpdate", lastUpdate.toString());
                items.add(item);
            }
        }
        return items;
    }
}
