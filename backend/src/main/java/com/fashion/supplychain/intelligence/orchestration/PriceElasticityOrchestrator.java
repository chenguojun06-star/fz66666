package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 价格弹性预测智能体
 *
 * 功能：
 * - 分析价格与销量的关系
 * - 预测不同价格点的销量变化
 * - 计算最优定价策略
 * - 评估价格调整对利润的影响
 *
 * 核心价值：帮助制定最优定价策略，最大化利润
 */
@Service
@Lazy
@Slf4j
public class PriceElasticityOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 分析款号的价格弹性
     */
    public PriceElasticityResponse analyzeElasticity(String styleNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询历史销售数据
        LocalDateTime start = LocalDateTime.now().minusMonths(6);
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "unit_price", "qualified_quantity", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("style_no", styleNo)
                .ge("create_time", start)
                .orderByAsc("create_time")
                .last("LIMIT 2000");

        List<ProductWarehousing> records = productWarehousingMapper.selectList(wrapper);

        if (records.isEmpty()) {
            PriceElasticityResponse empty = new PriceElasticityResponse();
            empty.setStyleNo(styleNo);
            empty.setNote("历史数据不足，无法分析");
            return empty;
        }

        // 分析价格弹性
        ElasticityAnalysis elasticity = analyzePriceElasticity(records);

        // 计算最优价格
        OptimalPrice optimalPrice = calculateOptimalPrice(records, elasticity);

        // 生成价格策略建议
        List<PricingStrategy> strategies = generatePricingStrategies(records, elasticity);

        PriceElasticityResponse response = new PriceElasticityResponse();
        response.setStyleNo(styleNo);
        response.setStyleName(records.get(0).getStyleName());
        response.setElasticityAnalysis(elasticity);
        response.setOptimalPrice(optimalPrice);
        response.setPricingStrategies(strategies);
        response.setAnalysisDate(LocalDate.now());
        response.setHistoricalDataPoints(records.size());

        log.info("[PriceElasticity] 价格弹性分析完成: styleNo={}, elasticity={}, optimalPrice={}",
                styleNo, elasticity.getElasticityValue(), optimalPrice.getPrice());

        return response;
    }

    /**
     * 预测价格调整后的销量变化
     */
    public PriceImpactResponse predictPriceImpact(String styleNo, double currentPrice, double newPrice) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询历史数据
        LocalDateTime start = LocalDateTime.now().minusMonths(3);
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("unit_price", "qualified_quantity")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("style_no", styleNo)
                .ge("create_time", start)
                .last("LIMIT 500");

        List<ProductWarehousing> records = productWarehousingMapper.selectList(wrapper);

        if (records.isEmpty()) {
            PriceImpactResponse empty = new PriceImpactResponse();
            empty.setStyleNo(styleNo);
            empty.setNote("历史数据不足，无法预测");
            return empty;
        }

        // 计算价格弹性
        ElasticityAnalysis elasticity = analyzePriceElasticity(records);

        // 计算价格变化百分比
        double priceChangePercent = (newPrice - currentPrice) / currentPrice;

        // 根据弹性预测销量变化
        double predictedSalesChange = -priceChangePercent * elasticity.getElasticityValue();

        // 计算当前平均销量
        double avgSales = records.stream()
                .filter(r -> r.getQualifiedQuantity() != null)
                .mapToInt(ProductWarehousing::getQualifiedQuantity)
                .average()
                .orElse(100);

        // 计算预测销量和收入
        double predictedSales = avgSales * (1 + predictedSalesChange);
        double currentRevenue = currentPrice * avgSales;
        double predictedRevenue = newPrice * predictedSales;

        PriceImpactResponse response = new PriceImpactResponse();
        response.setStyleNo(styleNo);
        response.setCurrentPrice(BigDecimal.valueOf(currentPrice).setScale(2, RoundingMode.HALF_UP));
        response.setNewPrice(BigDecimal.valueOf(newPrice).setScale(2, RoundingMode.HALF_UP));
        response.setPriceChangePercent((int) Math.round(priceChangePercent * 100));
        response.setElasticityValue(elasticity.getElasticityValue());
        response.setPredictedSalesChangePercent((int) Math.round(predictedSalesChange * 100));
        response.setPredictedDailySales((int) Math.round(predictedSales));
        response.setCurrentDailyRevenue(BigDecimal.valueOf(currentRevenue).setScale(2, RoundingMode.HALF_UP));
        response.setPredictedDailyRevenue(BigDecimal.valueOf(predictedRevenue).setScale(2, RoundingMode.HALF_UP));
        response.setRevenueImpact(predictedRevenue - currentRevenue);
        response.setConfidence(elasticity.getConfidence());

        log.info("[PriceElasticity] 价格影响预测完成: styleNo={}, priceChange={}%, salesChange={}%, revenueChange={}",
                styleNo, response.getPriceChangePercent(), response.getPredictedSalesChangePercent(), response.getRevenueImpact());

        return response;
    }

    /**
     * 获取定价建议报告
     */
    public PricingRecommendationsResponse getPricingRecommendations(List<String> styleNos) {
        List<PricingRecommendation> recommendations = new ArrayList<>();

        for (String styleNo : styleNos) {
            try {
                PriceElasticityResponse elasticity = analyzeElasticity(styleNo);
                PricingRecommendation recommendation = new PricingRecommendation();
                recommendation.setStyleNo(styleNo);
                recommendation.setStyleName(elasticity.getStyleName());
                recommendation.setElasticityValue(elasticity.getElasticityAnalysis().getElasticityValue());
                recommendation.setOptimalPrice(elasticity.getOptimalPrice().getPrice());
                recommendation.setOptimalPriceRevenue(elasticity.getOptimalPrice().getRevenue());
                recommendation.setElasticityType(classifyElasticity(elasticity.getElasticityAnalysis().getElasticityValue()));

                recommendations.add(recommendation);
            } catch (Exception e) {
                log.warn("[PriceElasticity] 分析失败: styleNo={}, error={}", styleNo, e.getMessage());
            }
        }

        // 按最优收入排序
        recommendations.sort((a, b) -> {
            BigDecimal aRevenue = a.getOptimalPriceRevenue();
            BigDecimal bRevenue = b.getOptimalPriceRevenue();
            return aRevenue != null && bRevenue != null ? aRevenue.compareTo(bRevenue) : 0;
        });

        PricingRecommendationsResponse response = new PricingRecommendationsResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalAnalyzed(recommendations.size());
        response.setRecommendations(recommendations);

        return response;
    }

    /**
     * 分析价格弹性
     */
    private ElasticityAnalysis analyzePriceElasticity(List<ProductWarehousing> records) {
        ElasticityAnalysis analysis = new ElasticityAnalysis();

        // 计算平均价格和销量
        double avgPrice = records.stream()
                .filter(r -> r.getUnitPrice() != null)
                .mapToDouble(r -> r.getUnitPrice().doubleValue())
                .average()
                .orElse(100);

        double avgQuantity = records.stream()
                .filter(r -> r.getQualifiedQuantity() != null)
                .mapToInt(ProductWarehousing::getQualifiedQuantity)
                .average()
                .orElse(100);

        // 计算协方差和方差
        double covariance = 0;
        double variance = 0;
        int count = 0;

        for (ProductWarehousing record : records) {
            if (record.getUnitPrice() != null && record.getQualifiedQuantity() != null) {
                double price = record.getUnitPrice().doubleValue();
                double quantity = record.getQualifiedQuantity();

                double priceDeviation = price - avgPrice;
                double quantityDeviation = quantity - avgQuantity;

                covariance += priceDeviation * quantityDeviation;
                variance += priceDeviation * priceDeviation;
                count++;
            }
        }

        // 计算弹性系数
        double elasticity = 0;
        if (variance != 0 && count > 0) {
            double slope = covariance / variance;
            elasticity = slope * (avgPrice / avgQuantity);
        }

        analysis.setElasticityValue(Math.abs(elasticity));
        analysis.setElasticityType(classifyElasticity(elasticity));
        analysis.setAveragePrice(BigDecimal.valueOf(avgPrice).setScale(2, RoundingMode.HALF_UP));
        analysis.setAverageQuantity((int) Math.round(avgQuantity));
        analysis.setConfidence(count >= 100 ? 85 : count >= 50 ? 70 : count >= 20 ? 50 : 30);

        return analysis;
    }

    /**
     * 计算最优价格
     */
    private OptimalPrice calculateOptimalPrice(List<ProductWarehousing> records, ElasticityAnalysis elasticity) {
        OptimalPrice optimal = new OptimalPrice();

        double avgPrice = elasticity.getAveragePrice().doubleValue();
        double elasticityValue = elasticity.getElasticityValue();

        // 最优价格公式：P = MC / (1 + 1/E)
        // 简化：假设边际成本为平均价格的50%
        double marginalCost = avgPrice * 0.5;

        double optimalPrice;
        if (elasticityValue > 1) {
            // 需求富有弹性，降低价格增加收入
            optimalPrice = marginalCost / (1 + 1 / elasticityValue);
        } else if (elasticityValue > 0 && elasticityValue < 1) {
            // 需求缺乏弹性，提高价格增加收入
            optimalPrice = marginalCost / (1 + 1 / elasticityValue);
        } else {
            optimalPrice = avgPrice;
        }

        // 限制价格范围（不低于成本，不高于原价的2倍）
        optimalPrice = Math.max(marginalCost, Math.min(optimalPrice, avgPrice * 2));

        // 计算预期收入
        double avgQuantity = elasticity.getAverageQuantity();
        double priceChangePercent = (optimalPrice - avgPrice) / avgPrice;
        double salesChangePercent = -priceChangePercent * elasticityValue;
        double predictedQuantity = avgQuantity * (1 + salesChangePercent);
        double predictedRevenue = optimalPrice * predictedQuantity;

        optimal.setPrice(BigDecimal.valueOf(optimalPrice).setScale(2, RoundingMode.HALF_UP));
        optimal.setRevenue(BigDecimal.valueOf(predictedRevenue).setScale(2, RoundingMode.HALF_UP));
        optimal.setQuantity((int) Math.round(predictedQuantity));
        optimal.setPriceChangePercent((int) Math.round(priceChangePercent * 100));
        optimal.setSalesChangePercent((int) Math.round(salesChangePercent * 100));

        return optimal;
    }

    /**
     * 生成定价策略建议
     */
    private List<PricingStrategy> generatePricingStrategies(List<ProductWarehousing> records, ElasticityAnalysis elasticity) {
        List<PricingStrategy> strategies = new ArrayList<>();

        double elasticityValue = elasticity.getElasticityValue();

        if (elasticityValue > 1.5) {
            // 高弹性：降价促销
            PricingStrategy strategy = new PricingStrategy();
            strategy.setStrategyType("促销定价");
            strategy.setDescription("需求高弹性，适合降价促销策略");
            strategy.setRecommendedAction("建议降价10-20%，预计销量提升15-40%");
            strategy.setExpectedRevenueChange("+10-25%");
            strategy.setRiskLevel("LOW");
            strategies.add(strategy);
        } else if (elasticityValue > 1 && elasticityValue <= 1.5) {
            // 中等弹性
            PricingStrategy strategy = new PricingStrategy();
            strategy.setStrategyType("弹性定价");
            strategy.setDescription("需求中等弹性，价格调整对销量有显著影响");
            strategy.setRecommendedAction("建议小幅降价(5-10%)或提供优惠券");
            strategy.setExpectedRevenueChange("+5-15%");
            strategy.setRiskLevel("LOW");
            strategies.add(strategy);
        } else if (elasticityValue > 0.5 && elasticityValue <= 1) {
            // 低弹性
            PricingStrategy strategy = new PricingStrategy();
            strategy.setStrategyType("溢价定价");
            strategy.setDescription("需求缺乏弹性，可考虑适当提价");
            strategy.setRecommendedAction("建议提价5-15%，销量影响较小");
            strategy.setExpectedRevenueChange("+5-10%");
            strategy.setRiskLevel("MEDIUM");
            strategies.add(strategy);
        } else {
            // 无弹性
            PricingStrategy strategy = new PricingStrategy();
            strategy.setStrategyType("稳定定价");
            strategy.setDescription("需求价格弹性低，价格变化对销量影响不大");
            strategy.setRecommendedAction("保持价格稳定，关注其他因素");
            strategy.setExpectedRevenueChange("0%");
            strategy.setRiskLevel("LOW");
            strategies.add(strategy);
        }

        return strategies;
    }

    private String classifyElasticity(double elasticity) {
        double absElasticity = Math.abs(elasticity);
        if (absElasticity > 1.5) return "HIGH_ELASTIC";
        if (absElasticity > 1) return "ELASTIC";
        if (absElasticity > 0.5) return "INELASTIC";
        return "VERY_INELASTIC";
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class PriceElasticityResponse {
        private String styleNo;
        private String styleName;
        private ElasticityAnalysis elasticityAnalysis;
        private OptimalPrice optimalPrice;
        private List<PricingStrategy> pricingStrategies;
        private LocalDate analysisDate;
        private int historicalDataPoints;
        private String note;
    }

    @Data
    public static class ElasticityAnalysis {
        private double elasticityValue;
        private String elasticityType;
        private BigDecimal averagePrice;
        private int averageQuantity;
        private int confidence;
    }

    @Data
    public static class OptimalPrice {
        private BigDecimal price;
        private BigDecimal revenue;
        private int quantity;
        private int priceChangePercent;
        private int salesChangePercent;
    }

    @Data
    public static class PricingStrategy {
        private String strategyType;
        private String description;
        private String recommendedAction;
        private String expectedRevenueChange;
        private String riskLevel;
    }

    @Data
    public static class PriceImpactResponse {
        private String styleNo;
        private BigDecimal currentPrice;
        private BigDecimal newPrice;
        private int priceChangePercent;
        private double elasticityValue;
        private int predictedSalesChangePercent;
        private int predictedDailySales;
        private BigDecimal currentDailyRevenue;
        private BigDecimal predictedDailyRevenue;
        private double revenueImpact;
        private int confidence;
        private String note;
    }

    @Data
    public static class PricingRecommendationsResponse {
        private LocalDate analysisDate;
        private int totalAnalyzed;
        private List<PricingRecommendation> recommendations;
    }

    @Data
    public static class PricingRecommendation {
        private String styleNo;
        private String styleName;
        private double elasticityValue;
        private BigDecimal optimalPrice;
        private BigDecimal optimalPriceRevenue;
        private String elasticityType;
    }
}
