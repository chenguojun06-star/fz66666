package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.dto.StyleIntelligenceProfileResponse.TenantPreferenceProfile;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TenantIntelligencePreferenceService {

    @Autowired
    private IntelligenceReasonLibraryService intelligenceReasonLibraryService;

    public TenantPreferenceProfile learnProfile(List<ProductionOrder> orders, List<ScanRecord> scanRecords) {
        TenantPreferenceProfile profile = new TenantPreferenceProfile();

        double delayedRate = orders.isEmpty() ? 0D : orders.stream()
                .filter(order -> "delayed".equalsIgnoreCase(order.getStatus()))
                .count() * 1.0D / orders.size();
        double failedRate = scanRecords.isEmpty() ? 0D : scanRecords.stream()
                .filter(record -> !"success".equalsIgnoreCase(record.getScanResult()))
                .count() * 1.0D / scanRecords.size();

        long successCount = scanRecords.stream()
                .filter(record -> "success".equalsIgnoreCase(record.getScanResult()))
                .count();
        double unsettledRate = successCount == 0 ? 0D : scanRecords.stream()
                .filter(record -> "success".equalsIgnoreCase(record.getScanResult()))
                .filter(record -> record.getPayrollSettlementId() == null || record.getPayrollSettlementId().isBlank())
                .count() * 1.0D / successCount;

        BigDecimal avgMargin = calculateAverageMargin(orders);

        profile.setDeliveryWarningDays(delayedRate >= 0.30D ? 7 : delayedRate >= 0.15D ? 5 : 3);
        profile.setAnomalyWarningCount(failedRate >= 0.10D ? 2 : failedRate >= 0.05D ? 3 : 5);
        profile.setLowMarginThreshold(avgMargin.compareTo(BigDecimal.valueOf(8)) < 0
                ? BigDecimal.TEN
                : avgMargin.compareTo(BigDecimal.valueOf(15)) < 0
                ? BigDecimal.valueOf(8)
                : BigDecimal.valueOf(5));

        double deliveryPressure = delayedRate;
        double profitPressure = avgMargin.compareTo(profile.getLowMarginThreshold()) < 0
                ? profile.getLowMarginThreshold().subtract(avgMargin).doubleValue() / 100.0D
                : 0D;
        double cashflowPressure = unsettledRate;

        if (profitPressure >= deliveryPressure && profitPressure >= cashflowPressure) {
            profile.setPrimaryGoal("PROFIT");
            profile.setPrimaryGoalLabel("利润优先");
        } else if (cashflowPressure >= deliveryPressure && cashflowPressure > 0.35D) {
            profile.setPrimaryGoal("CASHFLOW");
            profile.setPrimaryGoalLabel("回款优先");
        } else {
            profile.setPrimaryGoal("DELIVERY");
            profile.setPrimaryGoalLabel("交期优先");
        }

        FactoryRiskAggregate topFactory = buildFactoryRiskAggregates(orders).values().stream()
                .max(Comparator.comparingDouble(FactoryRiskAggregate::riskScore))
                .orElse(null);
        if (topFactory != null) {
            profile.setTopRiskFactoryName(topFactory.factoryName());
            profile.setTopRiskFactoryReason(intelligenceReasonLibraryService.buildFactoryRiskReason(
                    topFactory.factoryName(),
                    topFactory.delayedRate(),
                    topFactory.avgProgress(),
                    topFactory.lowMarginRate()));
        }

        return profile;
    }

    private BigDecimal calculateAverageMargin(List<ProductionOrder> orders) {
        List<BigDecimal> margins = orders.stream()
                .filter(order -> order.getQuotationUnitPrice() != null && order.getQuotationUnitPrice().compareTo(BigDecimal.ZERO) > 0)
                .filter(order -> order.getFactoryUnitPrice() != null)
                .map(order -> order.getQuotationUnitPrice()
                        .subtract(order.getFactoryUnitPrice())
                        .divide(order.getQuotationUnitPrice(), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100)))
                .toList();
        if (margins.isEmpty()) {
            return BigDecimal.valueOf(8);
        }
        BigDecimal total = margins.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(margins.size()), 2, RoundingMode.HALF_UP);
    }

    private Map<String, FactoryRiskAggregate> buildFactoryRiskAggregates(List<ProductionOrder> orders) {
        Map<String, MutableFactoryRiskAggregate> stats = new HashMap<>();
        for (ProductionOrder order : orders) {
            String factoryName = order.getFactoryName() == null || order.getFactoryName().isBlank()
                    ? "未分配工厂"
                    : order.getFactoryName().trim();
            MutableFactoryRiskAggregate current = stats.computeIfAbsent(factoryName, key -> new MutableFactoryRiskAggregate());
            current.factoryName = factoryName;
            current.totalCount++;
            if ("delayed".equalsIgnoreCase(order.getStatus())) {
                current.delayedCount++;
            }
            current.progressTotal += safeInt(order.getProductionProgress());
            if (order.getQuotationUnitPrice() != null && order.getQuotationUnitPrice().compareTo(BigDecimal.ZERO) > 0
                    && order.getFactoryUnitPrice() != null) {
                BigDecimal margin = order.getQuotationUnitPrice()
                        .subtract(order.getFactoryUnitPrice())
                        .divide(order.getQuotationUnitPrice(), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                if (margin.compareTo(BigDecimal.valueOf(8)) < 0) {
                    current.lowMarginCount++;
                }
            }
        }

        Map<String, FactoryRiskAggregate> result = new HashMap<>();
        stats.forEach((key, value) -> result.put(key, value.toImmutable()));
        return result;
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private static class MutableFactoryRiskAggregate {
        private String factoryName;
        private int totalCount;
        private int delayedCount;
        private int progressTotal;
        private int lowMarginCount;

        private FactoryRiskAggregate toImmutable() {
            int avgProgress = totalCount == 0 ? 0 : Math.round(progressTotal * 1.0f / totalCount);
            double delayedRate = totalCount == 0 ? 0D : delayedCount * 1.0D / totalCount;
            double lowMarginRate = totalCount == 0 ? 0D : lowMarginCount * 1.0D / totalCount;
            double riskScore = delayedRate * 0.60D + Math.max(0, 50 - avgProgress) / 100.0D * 0.25D + lowMarginRate * 0.15D;
            return new FactoryRiskAggregate(factoryName, avgProgress, delayedRate, lowMarginRate, riskScore);
        }
    }

    private record FactoryRiskAggregate(String factoryName, int avgProgress, double delayedRate, double lowMarginRate,
                                        double riskScore) {
    }
}
