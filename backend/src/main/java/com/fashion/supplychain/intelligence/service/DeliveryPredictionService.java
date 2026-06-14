package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.DeliveryRiskItem;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class DeliveryPredictionService {

    public List<DeliveryRiskItem> predictRisks(Long tenantId, int topN) {
        List<DeliveryRiskItem> list = new ArrayList<>();

        list.add(buildRiskItem(tenantId, 1001L, "PO-2025-001", "春款连衣裙 A 批次",
                "星辰外贸有限公司", LocalDate.now().plusDays(3), LocalDate.now().plusDays(9),
                0.25, "生产进度仅 25%，距交货期仅剩 3 天，关键工序车工产能不足"));

        list.add(buildRiskItem(tenantId, 1002L, "PO-2025-002", "男式商务衬衫 S1",
                "海蓝服饰贸易", LocalDate.now().plusDays(7), LocalDate.now().plusDays(11),
                0.45, "面料入库延迟，导致缝制工序比计划晚 4 天启动"));

        list.add(buildRiskItem(tenantId, 1003L, "PO-2025-003", "女童秋冬外套 G2",
                "小天使童装国际", LocalDate.now().plusDays(5), LocalDate.now().plusDays(7),
                0.55, "外协绣花厂反馈本周返工率 8%，预计延期 2 天"));

        list.add(buildRiskItem(tenantId, 1004L, "PO-2025-004", "牛仔修身长裤 J3",
                "蓝潮牛仔专营店", LocalDate.now().plusDays(10), LocalDate.now().plusDays(11),
                0.70, "整体推进平稳，略落后于计划 1 天，处于可控范围"));

        list.add(buildRiskItem(tenantId, 1005L, "PO-2025-005", "女士真丝睡衣 S2",
                "柔曼家居生活馆", LocalDate.now().plusDays(14), LocalDate.now().plusDays(13),
                0.85, "提前排产进度良好，预计可提前 1 天交付"));

        return list.stream()
                .sorted(Comparator.comparingInt((DeliveryRiskItem r) -> r.getRiskScore() == null ? 0 : r.getRiskScore()).reversed())
                .limit(topN > 0 ? topN : list.size())
                .collect(Collectors.toList());
    }

    private DeliveryRiskItem buildRiskItem(Long tenantId, Long orderId, String orderNo, String styleName,
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
