package com.fashion.supplychain.intelligence.engine.risk;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@Lazy
public class RiskRuleConfigService {

    @Value("${xiaoyun.risk.delay.threshold-days:3}")
    private int delayThresholdDays;

    @Value("${xiaoyun.risk.quality.defect-rate:5.0}")
    private double qualityDefectRate;

    @Value("${xiaoyun.risk.cost.over-budget-pct:15.0}")
    private double costOverBudgetPct;

    @Value("${xiaoyun.risk.material.shortage-pct:20.0}")
    private double materialShortagePct;

    @Value("${xiaoyun.risk.delivery.late-rate:30.0}")
    private double deliveryLateRate;

    @Value("${xiaoyun.risk.factory.silent-days:7}")
    private int factorySilentDays;

    @Value("${xiaoyun.risk.stagnant.days:5}")
    private int stagnantDays;

    @Value("${xiaoyun.risk.min-severity-threshold:30}")
    private int minSeverityThreshold;

    private final Map<String, Double> customThresholds = new ConcurrentHashMap<>();
    private final Map<RiskType, Double> runtimeTypeWeights = new ConcurrentHashMap<>();

    public RiskRuleConfigService() {
        runtimeTypeWeights.put(RiskType.DELAY, 1.0);
        runtimeTypeWeights.put(RiskType.QUALITY, 0.9);
        runtimeTypeWeights.put(RiskType.COST, 0.7);
        runtimeTypeWeights.put(RiskType.MATERIAL, 0.85);
        runtimeTypeWeights.put(RiskType.DELIVERY, 0.95);
        runtimeTypeWeights.put(RiskType.FACTORY, 0.8);
        runtimeTypeWeights.put(RiskType.STAGNANT, 0.75);
    }

    public Map<RiskType, Double> getAllTypeWeights() {
        return new EnumMap<>(runtimeTypeWeights);
    }

    public void setTypeWeight(RiskType type, double weight) {
        runtimeTypeWeights.put(type, weight);
    }

    public boolean isAboveThreshold(RiskItem item) {
        if (item == null) return false;
        if (item.getScore() < minSeverityThreshold) return false;
        return true;
    }

    public int getDelayThresholdDays() { return delayThresholdDays; }
    public double getQualityDefectRate() { return qualityDefectRate; }
    public double getCostOverBudgetPct() { return costOverBudgetPct; }
    public double getMaterialShortagePct() { return materialShortagePct; }
    public double getDeliveryLateRate() { return deliveryLateRate; }
    public int getFactorySilentDays() { return factorySilentDays; }
    public int getStagnantDays() { return stagnantDays; }
    public int getMinSeverityThreshold() { return minSeverityThreshold; }

    public void setCustomThreshold(String key, double value) {
        customThresholds.put(key, value);
    }

    public Double getCustomThreshold(String key) {
        return customThresholds.get(key);
    }

    public void setDelayThresholdDays(int days) { this.delayThresholdDays = days; }
    public void setQualityDefectRate(double rate) { this.qualityDefectRate = rate; }
    public void setCostOverBudgetPct(double pct) { this.costOverBudgetPct = pct; }
    public void setMaterialShortagePct(double pct) { this.materialShortagePct = pct; }
    public void setDeliveryLateRate(double rate) { this.deliveryLateRate = rate; }
    public void setFactorySilentDays(int days) { this.factorySilentDays = days; }
    public void setStagnantDays(int days) { this.stagnantDays = days; }
    public void setMinSeverityThreshold(int threshold) { this.minSeverityThreshold = threshold; }

    public ThresholdSnapshot snapshot() {
        ThresholdSnapshot s = new ThresholdSnapshot();
        s.setDelayThresholdDays(delayThresholdDays);
        s.setQualityDefectRate(qualityDefectRate);
        s.setCostOverBudgetPct(costOverBudgetPct);
        s.setMaterialShortagePct(materialShortagePct);
        s.setDeliveryLateRate(deliveryLateRate);
        s.setFactorySilentDays(factorySilentDays);
        s.setStagnantDays(stagnantDays);
        s.setMinSeverityThreshold(minSeverityThreshold);
        s.setCustomThresholds(new java.util.HashMap<>(customThresholds));
        s.setTypeWeights(new EnumMap<>(runtimeTypeWeights));
        return s;
    }

    @Data
    public static class ThresholdSnapshot {
        private int delayThresholdDays;
        private double qualityDefectRate;
        private double costOverBudgetPct;
        private double materialShortagePct;
        private double deliveryLateRate;
        private int factorySilentDays;
        private int stagnantDays;
        private int minSeverityThreshold;
        private Map<String, Double> customThresholds;
        private Map<RiskType, Double> typeWeights;
    }
}
