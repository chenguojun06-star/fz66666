package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Lazy
@RequiredArgsConstructor
public class FactoryRiskDetector implements RiskDetector {

    private final ProductionOrderMapper orderMapper;

    @Override
    public RiskType getType() { return RiskType.FACTORY; }

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of(
            "completed", "cancelled", "scrapped", "archived", "closed"
    );

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getFactoryId, ProductionOrder::getUpdateTime,
                                ProductionOrder::getDeliverySlaStatus)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .filter(o -> o.getFactoryId() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryId));
        List<RiskItem> items = new ArrayList<>();

        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            List<ProductionOrder> factoryOrders = entry.getValue();
            long silentCount = 0;
            long overdueCount = 0;
            for (ProductionOrder o : factoryOrders) {
                // 终态已在SQL层过滤，无需Java层再过滤
                if (o.getUpdateTime() != null
                        && ChronoUnit.HOURS.between(o.getUpdateTime(), java.time.LocalDateTime.now()) > 72) {
                    silentCount++;
                }
                String slaStatus = o.getDeliverySlaStatus() != null ? o.getDeliverySlaStatus() : "";
                if (slaStatus.contains("DELAYED") || slaStatus.contains("OVERDUE")) {
                    overdueCount++;
                }
            }

            if (silentCount >= 3) {
                String severity = silentCount >= 10 ? "CRITICAL" : "HIGH";
                RiskItem item = RiskItem.create(RiskType.FACTORY, severity, Math.min(100, 60 + silentCount * 3));
                item.setFactoryId(entry.getKey());
                item.setDescription("工厂 " + entry.getKey() + " 有 " + silentCount + " 个订单已沉默超 72 小时");
                item.setSuggestedAction("联系工厂负责人，排查产能问题，必要时启动备选工厂");
                item.getMetadata().put("silentOrders", silentCount);
                item.getMetadata().put("overdueOrders", overdueCount);
                items.add(item);
            } else if (overdueCount >= 5) {
                RiskItem item = RiskItem.create(RiskType.FACTORY, "HIGH", 75.0);
                item.setFactoryId(entry.getKey());
                item.setDescription("工厂 " + entry.getKey() + " 有 " + overdueCount + " 个订单延期");
                item.setSuggestedAction("评估工厂履约能力，启动备选工厂分流");
                item.getMetadata().put("overdueOrders", overdueCount);
                items.add(item);
            }
        }
        return items;
    }
}
