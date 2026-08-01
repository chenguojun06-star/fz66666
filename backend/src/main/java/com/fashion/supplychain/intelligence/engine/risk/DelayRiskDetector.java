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
        java.time.LocalDateTime threeMonthsAgo = java.time.LocalDateTime.now().minusMonths(3);
        List<ProductionOrder> orders = orderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                                ProductionOrder::getStatus, ProductionOrder::getDeliverySlaStatus,
                                ProductionOrder::getFactoryId, ProductionOrder::getPlannedEndDate,
                                ProductionOrder::getProductionProgress)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .ge(ProductionOrder::getUpdateTime, threeMonthsAgo)
                        .last("LIMIT 500"));
        if (orders.isEmpty()) return List.of();

        List<RiskItem> items = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
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
            } else {
                // P0修复：增加"剩余天数<3 + 生产进度<50%"组合判定
                LocalDateTime plannedEndDate = o.getPlannedEndDate();
                Integer progress = o.getProductionProgress();
                if (plannedEndDate != null && progress != null) {
                    long remainingDays = ChronoUnit.DAYS.between(now.toLocalDate(), plannedEndDate.toLocalDate());
                    if (remainingDays < 3 && progress < 50) {
                        String severity = remainingDays < 0 ? "CRITICAL"
                                : remainingDays < 1 ? "HIGH" : "MEDIUM";
                        double score = Math.min(100, 70 + (3 - remainingDays) * 10);
                        RiskItem item = RiskItem.create(RiskType.DELAY, severity, score);
                        item.setOrderId(o.getId());
                        item.setFactoryId(o.getFactoryId());
                        item.setDescription("订单 " + o.getOrderNo() + " 距交期仅 " + remainingDays
                                + " 天，生产进度仅 " + progress + "%");
                        item.setSuggestedAction("紧急催办工厂加急生产，评估是否需要转厂或加班");
                        item.getMetadata().put("remainingDays", remainingDays);
                        item.getMetadata().put("productionProgress", progress);
                        item.getMetadata().put("plannedEndDate", plannedEndDate.toString());
                        items.add(item);
                    }
                }
            }
        }
        return items;
    }
}
