package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 运输成本优化智能体
 *
 * 功能：
 * - 分析运输成本构成
 * - 识别成本优化机会
 * - 提供运输方案建议
 * - 评估运输成本节约潜力
 *
 * 核心价值：降低运输成本，提升物流效率
 */
@Service
@Lazy
@Slf4j
public class TransportationCostOptimizer {

    /**
     * 获取运输成本分析报告
     */
    public TransportationCostResponse analyzeTransportationCosts() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取运输数据
        List<TransportationData> transportData = fetchTransportationData(tenantId);

        // 计算成本统计
        TransportationCostStats stats = calculateCostStats(transportData);

        // 识别优化机会
        List<CostOptimization> optimizations = identifyOptimizationOpportunities(transportData);

        // 生成成本节约方案
        List<CostSavingPlan> savingPlans = generateCostSavingPlans(optimizations);

        TransportationCostResponse response = new TransportationCostResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalShipments(transportData.size());
        response.setTotalCost(stats.getTotalCost());
        response.setAverageCostPerShipment(stats.getAverageCostPerShipment());
        response.setCostStats(stats);
        response.setOptimizationOpportunities(optimizations);
        response.setCostSavingPlans(savingPlans);

        log.info("[TransportationCost] 运输成本分析完成: shipments={}, totalCost={}, optimizations={}",
                transportData.size(), stats.getTotalCost(), optimizations.size());

        return response;
    }

    /**
     * 获取最优运输方案建议
     */
    public OptimalTransportResponse getOptimalTransportPlan(String origin, String destination, int weight) {
        TenantAssert.assertTenantContext();

        // 模拟运输方案
        List<TransportOption> options = generateTransportOptions(origin, destination, weight);

        // 选择最优方案
        TransportOption optimal = selectOptimalOption(options);

        OptimalTransportResponse response = new OptimalTransportResponse();
        response.setOrigin(origin);
        response.setDestination(destination);
        response.setWeight(weight);
        response.setTransportOptions(options);
        response.setOptimalOption(optimal);

        return response;
    }

    /**
     * 获取承运商绩效评估
     */
    public CarrierPerformanceResponse evaluateCarrierPerformance() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<CarrierData> carrierData = fetchCarrierData(tenantId);

        List<CarrierPerformance> performances = carrierData.stream()
                .map(this::calculateCarrierPerformance)
                .sorted((a, b) -> Integer.compare(b.getPerformanceScore(), a.getPerformanceScore()))
                .collect(Collectors.toList());

        CarrierPerformanceResponse response = new CarrierPerformanceResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalCarriers(performances.size());
        response.setCarrierPerformances(performances);

        return response;
    }

    /**
     * 模拟获取运输数据
     */
    private List<TransportationData> fetchTransportationData(Long tenantId) {
        List<TransportationData> data = new ArrayList<>();

        data.add(new TransportationData("SF", "顺丰速运", "深圳", "上海", 100, 2500, 1.5, "AIR"));
        data.add(new TransportationData("SF", "顺丰速运", "广州", "北京", 80, 2000, 2, "AIR"));
        data.add(new TransportationData("YT", "圆通速递", "杭州", "成都", 200, 1800, 3, "LAND"));
        data.add(new TransportationData("ZT", "中通快递", "南京", "武汉", 150, 1200, 3.5, "LAND"));
        data.add(new TransportationData("JD", "京东物流", "北京", "天津", 50, 300, 1, "LAND"));
        data.add(new TransportationData("DN", "德邦物流", "上海", "广州", 500, 3000, 4, "LAND"));
        data.add(new TransportationData("EMS", "EMS", "成都", "西安", 30, 150, 2.5, "AIR"));

        return data;
    }

    /**
     * 模拟获取承运商数据
     */
    private List<CarrierData> fetchCarrierData(Long tenantId) {
        List<CarrierData> data = new ArrayList<>();

        data.add(new CarrierData("SF", "顺丰速运", 98, 24, 1.5, 0.02, 5000));
        data.add(new CarrierData("JD", "京东物流", 95, 12, 1.2, 0.01, 3000));
        data.add(new CarrierData("YT", "圆通速递", 90, 72, 0.8, 0.03, 2500));
        data.add(new CarrierData("ZT", "中通快递", 88, 72, 0.7, 0.04, 2800));
        data.add(new CarrierData("DN", "德邦物流", 92, 96, 1.0, 0.02, 4000));

        return data;
    }

    /**
     * 计算成本统计
     */
    private TransportationCostStats calculateCostStats(List<TransportationData> transportData) {
        TransportationCostStats stats = new TransportationCostStats();

        BigDecimal totalCost = transportData.stream()
                .map(d -> BigDecimal.valueOf(d.getCost()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        stats.setTotalCost(totalCost);

        int totalWeight = transportData.stream().mapToInt(TransportationData::getWeight).sum();
        stats.setTotalWeight(totalWeight);

        if (!transportData.isEmpty()) {
            stats.setAverageCostPerShipment(totalCost.divide(
                    BigDecimal.valueOf(transportData.size()), 2, RoundingMode.HALF_UP));
        }

        // 按运输方式统计
        Map<String, BigDecimal> costByMode = transportData.stream()
                .collect(Collectors.groupingBy(
                        TransportationData::getTransportMode,
                        Collectors.mapping(d -> BigDecimal.valueOf(d.getCost()),
                                Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));
        stats.setCostByTransportMode(costByMode);

        // 按承运商统计
        Map<String, BigDecimal> costByCarrier = transportData.stream()
                .collect(Collectors.groupingBy(
                        TransportationData::getCarrierCode,
                        Collectors.mapping(d -> BigDecimal.valueOf(d.getCost()),
                                Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));
        stats.setCostByCarrier(costByCarrier);

        return stats;
    }

    /**
     * 识别优化机会
     */
    private List<CostOptimization> identifyOptimizationOpportunities(List<TransportationData> transportData) {
        List<CostOptimization> optimizations = new ArrayList<>();

        // 识别高成本运输
        double avgCost = transportData.stream()
                .mapToDouble(TransportationData::getCost)
                .average()
                .orElse(0);

        for (TransportationData data : transportData) {
            if (data.getCost() > avgCost * 1.5) {
                CostOptimization opt = new CostOptimization();
                opt.setOpportunityType("HIGH_COST");
                opt.setDescription(String.format("%s从%s到%s运输成本较高",
                        data.getCarrierName(), data.getOrigin(), data.getDestination()));
                opt.setCurrentCost(BigDecimal.valueOf(data.getCost()));
                opt.setEstimatedSavings(BigDecimal.valueOf(data.getCost() * 0.2));
                opt.setRecommendation("建议更换承运商或运输方式");
                optimizations.add(opt);
            }
        }

        // 识别可优化的运输方式
        for (TransportationData data : transportData) {
            if ("AIR".equals(data.getTransportMode()) && data.getDays() > 1) {
                CostOptimization opt = new CostOptimization();
                opt.setOpportunityType("MODE_OPTIMIZATION");
                opt.setDescription(String.format("%s运输时间%s天，可考虑陆运",
                        data.getTransportMode(), data.getDays()));
                opt.setCurrentCost(BigDecimal.valueOf(data.getCost()));
                opt.setEstimatedSavings(BigDecimal.valueOf(data.getCost() * 0.3));
                opt.setRecommendation("建议改为陆运，可节省约30%成本");
                optimizations.add(opt);
            }
        }

        return optimizations;
    }

    /**
     * 生成成本节约方案
     */
    private List<CostSavingPlan> generateCostSavingPlans(List<CostOptimization> optimizations) {
        List<CostSavingPlan> plans = new ArrayList<>();

        if (optimizations.size() > 0) {
            CostSavingPlan plan = new CostSavingPlan();
            plan.setPriority("HIGH");
            plan.setAction("优化高成本运输");
            plan.setTarget(String.format("%d个高成本运输订单", optimizations.size()));
            plan.setEstimatedSavings(optimizations.stream()
                    .map(CostOptimization::getEstimatedSavings)
                    .reduce(BigDecimal.ZERO, BigDecimal::add));
            plan.setImplementationSteps(Arrays.asList(
                    "1. 分析高成本运输原因",
                    "2. 评估备选承运商",
                    "3. 协商运费价格",
                    "4. 切换承运商"
            ));
            plans.add(plan);
        }

        return plans;
    }

    /**
     * 生成运输选项
     */
    private List<TransportOption> generateTransportOptions(String origin, String destination, int weight) {
        List<TransportOption> options = new ArrayList<>();

        options.add(new TransportOption("SF", "顺丰速运", "AIR", 1.5, BigDecimal.valueOf(weight * 25), 98));
        options.add(new TransportOption("JD", "京东物流", "LAND", 2, BigDecimal.valueOf(weight * 15), 95));
        options.add(new TransportOption("YT", "圆通速递", "LAND", 3, BigDecimal.valueOf(weight * 10), 90));
        options.add(new TransportOption("DN", "德邦物流", "LAND", 4, BigDecimal.valueOf(weight * 8), 92));

        return options;
    }

    /**
     * 选择最优运输方案
     */
    private TransportOption selectOptimalOption(List<TransportOption> options) {
        return options.stream()
                .min(Comparator.comparing(o -> o.getCost().doubleValue() / o.getDeliveryRate()))
                .orElse(options.get(0));
    }

    /**
     * 计算承运商绩效
     */
    private CarrierPerformance calculateCarrierPerformance(CarrierData data) {
        CarrierPerformance performance = new CarrierPerformance();
        performance.setCarrierCode(data.getCarrierCode());
        performance.setCarrierName(data.getCarrierName());
        performance.setOnTimeRate(data.getOnTimeRate());
        performance.setAverageDeliveryHours(data.getAverageDeliveryHours());
        performance.setCostPerKg(BigDecimal.valueOf(data.getCostPerKg()));
        performance.setDamageRate(data.getDamageRate());
        performance.setMonthlyVolume(data.getMonthlyVolume());

        // 综合评分
        int score = 0;
        score += data.getOnTimeRate() / 2;
        score += Math.max(0, 25 - data.getAverageDeliveryHours());
        score += Math.min(25, (int) (1 / data.getCostPerKg() * 50));
        score += Math.max(0, 20 - (int) (data.getDamageRate() * 100));

        performance.setPerformanceScore(Math.min(score, 100));
        performance.setPerformanceLevel(score >= 90 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 50 ? "FAIR" : "POOR");

        return performance;
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class TransportationCostResponse {
        private LocalDate analysisDate;
        private int totalShipments;
        private BigDecimal totalCost;
        private BigDecimal averageCostPerShipment;
        private TransportationCostStats costStats;
        private List<CostOptimization> optimizationOpportunities;
        private List<CostSavingPlan> costSavingPlans;
    }

    @Data
    public static class TransportationCostStats {
        private BigDecimal totalCost;
        private int totalWeight;
        private BigDecimal averageCostPerShipment;
        private Map<String, BigDecimal> costByTransportMode;
        private Map<String, BigDecimal> costByCarrier;
    }

    @Data
    public static class CostOptimization {
        private String opportunityType;
        private String description;
        private BigDecimal currentCost;
        private BigDecimal estimatedSavings;
        private String recommendation;
    }

    @Data
    public static class CostSavingPlan {
        private String priority;
        private String action;
        private String target;
        private BigDecimal estimatedSavings;
        private List<String> implementationSteps;
    }

    @Data
    public static class OptimalTransportResponse {
        private String origin;
        private String destination;
        private int weight;
        private List<TransportOption> transportOptions;
        private TransportOption optimalOption;
    }

    @Data
    public static class TransportOption {
        private String carrierCode;
        private String carrierName;
        private String transportMode;
        private double estimatedDays;
        private BigDecimal cost;
        private int deliveryRate;

        public TransportOption(String carrierCode, String carrierName, String transportMode,
                              double estimatedDays, BigDecimal cost, int deliveryRate) {
            this.carrierCode = carrierCode;
            this.carrierName = carrierName;
            this.transportMode = transportMode;
            this.estimatedDays = estimatedDays;
            this.cost = cost;
            this.deliveryRate = deliveryRate;
        }
    }

    @Data
    public static class CarrierPerformanceResponse {
        private LocalDate analysisDate;
        private int totalCarriers;
        private List<CarrierPerformance> carrierPerformances;
    }

    @Data
    public static class CarrierPerformance {
        private String carrierCode;
        private String carrierName;
        private int onTimeRate;
        private int averageDeliveryHours;
        private BigDecimal costPerKg;
        private double damageRate;
        private int monthlyVolume;
        private int performanceScore;
        private String performanceLevel;
    }

    // 内部数据类
    @Data
    public static class TransportationData {
        private String carrierCode;
        private String carrierName;
        private String origin;
        private String destination;
        private int weight;
        private double cost;
        private double days;
        private String transportMode;

        public TransportationData(String carrierCode, String carrierName, String origin,
                                  String destination, int weight, double cost, double days, String transportMode) {
            this.carrierCode = carrierCode;
            this.carrierName = carrierName;
            this.origin = origin;
            this.destination = destination;
            this.weight = weight;
            this.cost = cost;
            this.days = days;
            this.transportMode = transportMode;
        }
    }

    @Data
    public static class CarrierData {
        private String carrierCode;
        private String carrierName;
        private int onTimeRate;
        private int averageDeliveryHours;
        private double costPerKg;
        private double damageRate;
        private int monthlyVolume;

        public CarrierData(String carrierCode, String carrierName, int onTimeRate,
                          int averageDeliveryHours, double costPerKg, double damageRate, int monthlyVolume) {
            this.carrierCode = carrierCode;
            this.carrierName = carrierName;
            this.onTimeRate = onTimeRate;
            this.averageDeliveryHours = averageDeliveryHours;
            this.costPerKg = costPerKg;
            this.damageRate = damageRate;
            this.monthlyVolume = monthlyVolume;
        }
    }
}
