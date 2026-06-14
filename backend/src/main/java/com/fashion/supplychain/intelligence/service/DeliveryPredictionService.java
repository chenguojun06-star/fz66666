package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.DeliveryRiskItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class DeliveryPredictionService {

    private static final Set<String> TERMINAL_STATUSES = Set.of(
            "completed", "cancelled", "scrapped", "archived", "closed"
    );

    @Autowired
    private ProductionOrderMapper orderMapper;

    public List<DeliveryRiskItem> predictRisks(Long tenantId, int topN) {
        List<DeliveryRiskItem> realItems = buildFromProductionOrders(tenantId);
        if (realItems.isEmpty()) {
            return buildDemoItems(tenantId, topN);
        }
        return realItems.stream()
                .sorted(Comparator.comparingInt((DeliveryRiskItem r) -> r.getRiskScore() == null ? 0 : r.getRiskScore()).reversed())
                .limit(topN > 0 ? topN : realItems.size())
                .collect(Collectors.toList());
    }

    private List<DeliveryRiskItem> buildFromProductionOrders(Long tenantId) {
        List<DeliveryRiskItem> result = new ArrayList<>();
        if (tenantId == null || orderMapper == null) {
            return result;
        }
        List<ProductionOrder> orders;
        try {
            orders = orderMapper.selectList(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                            .isNotNull(ProductionOrder::getExpectedShipDate)
                            .last("LIMIT 500")
            );
        } catch (Exception e) {
            return result;
        }
        if (orders == null || orders.isEmpty()) {
            return result;
        }

        LocalDate today = LocalDate.now();
        for (ProductionOrder o : orders) {
            LocalDateTime shipDateTime = o.getExpectedShipDate();
            if (shipDateTime == null) {
                continue;
            }
            LocalDate deliveryDate = shipDateTime.toLocalDate();

            double currentProgress = resolveProgress(o);
            long daysUntilDelivery = ChronoUnit.DAYS.between(today, deliveryDate);

            double remainingFactor = 1.0 - currentProgress;
            double score = remainingFactor * 80.0;
            if (daysUntilDelivery < 0) {
                score += 30;
            } else if (daysUntilDelivery < 7) {
                score += 15;
            } else if (daysUntilDelivery < 14) {
                score += 5;
            }
            int riskScore = (int) Math.round(score);
            riskScore = Math.max(0, Math.min(riskScore, 100));

            String riskLevel;
            if (riskScore >= 70) {
                riskLevel = "HIGH";
            } else if (riskScore >= 40) {
                riskLevel = "MEDIUM";
            } else {
                riskLevel = "LOW";
            }

            long deliveryWindowMillis = Math.max(1, ChronoUnit.DAYS.between(
                    o.getCreateTime() != null ? o.getCreateTime().toLocalDate() : today.minusDays(30),
                    deliveryDate
            ));
            long predictedDelayDays = Math.round(deliveryWindowMillis * remainingFactor) - Math.max(0, daysUntilDelivery);
            LocalDate predictedCompletionDate = deliveryDate.plusDays(predictedDelayDays > 0 ? predictedDelayDays : 0);
            if (remainingFactor <= 0) {
                predictedCompletionDate = deliveryDate;
                predictedDelayDays = 0;
            }

            int progressPct = (int) Math.round(currentProgress * 100);
            String daysText;
            if (daysUntilDelivery < 0) {
                daysText = "已过交期 " + (-daysUntilDelivery) + " 天";
            } else {
                daysText = "距交期 " + daysUntilDelivery + " 天";
            }
            String reason = String.format("进度%d%%，%s，预计完成日 %d月%d日",
                    progressPct, daysText,
                    predictedCompletionDate.getMonthValue(),
                    predictedCompletionDate.getDayOfMonth());

            DeliveryRiskItem item = new DeliveryRiskItem()
                    .setTenantId(tenantId)
                    .setOrderId(o.getId() != null ? (long) Math.abs(o.getId().hashCode()) : null)
                    .setOrderNo(o.getOrderNo())
                    .setStyleName(o.getStyleName())
                    .setCustomerName(firstNonBlank(o.getCustomerName(), o.getCompany()))
                    .setDeliveryDate(deliveryDate)
                    .setPredictedCompletionDate(predictedCompletionDate)
                    .setRiskLevel(riskLevel)
                    .setRiskScore(riskScore)
                    .setDelayDays((int) predictedDelayDays)
                    .setReason(reason)
                    .setCurrentProgress(currentProgress)
                    .setCreatedAt(LocalDateTime.now());
            result.add(item);
        }
        return result;
    }

    private double resolveProgress(ProductionOrder o) {
        Integer pp = o.getProductionProgress();
        if (pp != null && pp > 0) {
            return Math.min(1.0, pp / 100.0);
        }
        Integer orderQty = o.getOrderQuantity();
        Integer completedQty = o.getCompletedQuantity();
        if (orderQty != null && orderQty > 0 && completedQty != null) {
            return Math.min(1.0, completedQty.doubleValue() / orderQty.doubleValue());
        }
        return 0.3;
    }

    private static String firstNonBlank(String... candidates) {
        for (String c : candidates) {
            if (c != null && !c.isBlank()) {
                return c;
            }
        }
        return "";
    }

    private List<DeliveryRiskItem> buildDemoItems(Long tenantId, int topN) {
        List<DeliveryRiskItem> list = new ArrayList<>();
        list.add(buildDemoItem(tenantId, 1001L, "PO-DEMO-001", "春款连衣裙 A 批次",
                "星辰外贸有限公司", LocalDate.now().plusDays(3), LocalDate.now().plusDays(9),
                0.25, "生产进度仅 25%，距交货期仅剩 3 天，关键工序车工产能不足"));
        list.add(buildDemoItem(tenantId, 1002L, "PO-DEMO-002", "男式商务衬衫 S1",
                "海蓝服饰贸易", LocalDate.now().plusDays(7), LocalDate.now().plusDays(11),
                0.45, "面料入库延迟，导致缝制工序比计划晚 4 天启动"));
        list.add(buildDemoItem(tenantId, 1003L, "PO-DEMO-003", "女童秋冬外套 G2",
                "小天使童装国际", LocalDate.now().plusDays(5), LocalDate.now().plusDays(7),
                0.55, "外协绣花厂反馈本周返工率 8%，预计延期 2 天"));
        int limit = topN > 0 ? topN : list.size();
        return list.stream()
                .sorted(Comparator.comparingInt((DeliveryRiskItem r) -> r.getRiskScore() == null ? 0 : r.getRiskScore()).reversed())
                .limit(limit)
                .collect(Collectors.toList());
    }

    private DeliveryRiskItem buildDemoItem(Long tenantId, Long orderId, String orderNo, String styleName,
                                           String customerName, LocalDate deliveryDate, LocalDate predictedCompletionDate,
                                           double currentProgress, String reason) {
        long daysToDelivery = ChronoUnit.DAYS.between(LocalDate.now(), deliveryDate);
        long predictedDelay = ChronoUnit.DAYS.between(deliveryDate, predictedCompletionDate);

        int riskScore = (int) Math.round((1.0 - currentProgress) * 80.0);
        if (daysToDelivery <= 3) riskScore += 20;
        else if (daysToDelivery <= 7) riskScore += 10;
        if (predictedDelay > 0) riskScore += (int) Math.min(predictedDelay * 5, 30);
        riskScore = Math.max(0, Math.min(riskScore, 100));

        String riskLevel;
        if (riskScore >= 70) riskLevel = "HIGH";
        else if (riskScore >= 40) riskLevel = "MEDIUM";
        else riskLevel = "LOW";

        return new DeliveryRiskItem()
                .setTenantId(tenantId)
                .setOrderId(orderId)
                .setOrderNo(orderNo)
                .setStyleName(styleName)
                .setCustomerName(customerName)
                .setDeliveryDate(deliveryDate)
                .setPredictedCompletionDate(predictedCompletionDate)
                .setRiskLevel(riskLevel)
                .setRiskScore(riskScore)
                .setDelayDays((int) predictedDelay)
                .setReason(reason)
                .setCurrentProgress(currentProgress)
                .setCreatedAt(LocalDateTime.now());
    }
}
