package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
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
 * 促销选品与效果预测智能体
 *
 * 功能：
 * - 基于历史销售数据，预测不同促销策略对各款的销量提升
 * - 推荐最适合促销的款号和品类
 * - 预测促销效果（销量提升/销售额/利润变化）
 * - 评估促销ROI
 *
 * 核心价值：促销占销售额30%+，选品和策略直接影响促销效果
 */
@Service
@Lazy
@Slf4j
public class PromotionSelectionOrchestrator {

    @Autowired
    private ProductWarehousingMapper warehousingMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    /**
     * 推荐促销选品
     *
     * @param promotionType 促销类型（DISCOUNT满减/COUPON优惠券/BUNDLE捆绑/GIVEAWAY赠品）
     * @param targetDate 促销目标日期
     * @return 促销选品推荐
     */
    public PromotionSelectionResponse recommendPromotionSelection(String promotionType, LocalDate targetDate) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询近3个月的销售数据
        LocalDateTime start = LocalDateTime.now().minusMonths(3);
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "qualified_quantity", "create_time", "unit_price")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .ge("create_time", start)
                .orderByDesc("create_time")
                .last("LIMIT 5000");

        List<ProductWarehousing> salesData = warehousingMapper.selectList(wrapper);

        // 分析各款销售特征
        Map<String, StylePromotionProfile> profiles = analyzeStyleProfiles(salesData);

        // 计算促销敏感度
        List<PromotionCandidate> candidates = calculatePromotionSensitivity(profiles, promotionType);

        // 生成促销效果预测
        List<PromotionForecast> forecasts = predictPromotionEffect(candidates, promotionType);

        // 计算最优组合
        List<PromotionRecommendation> recommendations = generateRecommendations(forecasts, promotionType);

        PromotionSelectionResponse response = new PromotionSelectionResponse();
        response.setPromotionType(promotionType);
        response.setTargetDate(targetDate);
        response.setAnalysisDate(LocalDate.now());
        response.setTotalCandidates(candidates.size());
        response.setPromotionCandidates(candidates);
        response.setPromotionForecasts(forecasts);
        response.setRecommendations(recommendations);
        response.setOverallExpectedLift(calculateOverallLift(recommendations));
        response.setRiskLevel(assessRisk(recommendations));

        log.info("[Promotion] 促销选品推荐完成: type={}, candidates={}, recommendations={}",
                promotionType, candidates.size(), recommendations.size());

        return response;
    }

    /**
     * 预测特定促销策略的效果
     */
    public PromotionEffectForecast predictEffect(String styleNo, String promotionType,
                                                  int discountPercent, LocalDate startDate, int durationDays) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询历史数据
        LocalDateTime start = LocalDateTime.now().minusMonths(6);
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("qualified_quantity", "create_time", "unit_price")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("style_no", styleNo)
                .ge("create_time", start)
                .last("LIMIT 1000");

        List<ProductWarehousing> history = warehousingMapper.selectList(wrapper);

        if (history.isEmpty()) {
            PromotionEffectForecast empty = new PromotionEffectForecast();
            empty.setStyleNo(styleNo);
            empty.setPromotionType(promotionType);
            empty.setEstimatedSalesLift(0);
            empty.setConfidence(0);
            empty.setNote("历史数据不足，无法预测");
            return empty;
        }

        // 计算基线销量
        double avgDailySales = history.stream()
                .filter(h -> h.getQualifiedQuantity() != null)
                .mapToInt(ProductWarehousing::getQualifiedQuantity)
                .average()
                .orElse(0.0);

        // 估算平均单价
        double avgPrice = history.stream()
                .filter(h -> h.getUnitPrice() != null)
                .mapToDouble(h -> h.getUnitPrice().doubleValue())
                .average()
                .orElse(0.0);

        // 预测折扣效果（基于折扣敏感度模型）
        double lift = calculateSalesLift(discountPercent, promotionType);

        // 计算预测销量
        int predictedDailySales = (int) Math.round(avgDailySales * lift);
        int totalPredictedSales = predictedDailySales * durationDays;

        // 计算销售额变化
        double discountedPrice = avgPrice * (1 - discountPercent / 100.0);
        double baselineRevenue = avgDailySales * avgPrice * durationDays;
        double promotedRevenue = totalPredictedSales * discountedPrice;

        PromotionEffectForecast forecast = new PromotionEffectForecast();
        forecast.setStyleNo(styleNo);
        forecast.setPromotionType(promotionType);
        forecast.setDiscountPercent(discountPercent);
        forecast.setDurationDays(durationDays);
        forecast.setBaselineAvgDailySales((int) avgDailySales);
        forecast.setEstimatedSalesLift((int) Math.round((lift - 1) * 100));
        forecast.setEstimatedDailySales(predictedDailySales);
        forecast.setEstimatedTotalSales(totalPredictedSales);
        forecast.setBaselineRevenue(BigDecimal.valueOf(baselineRevenue).setScale(2, RoundingMode.HALF_UP));
        forecast.setEstimatedRevenue(BigDecimal.valueOf(promotedRevenue).setScale(2, RoundingMode.HALF_UP));
        forecast.setRevenueChange(promotedRevenue - baselineRevenue);
        forecast.setConfidence(calculateConfidence(history.size()));
        forecast.setRiskLevel(assessSingleRisk(lift, discountPercent));

        log.info("[Promotion] 促销效果预测: styleNo={}, type={}, lift={}%, revenueChange={}",
                styleNo, promotionType, Math.round((lift - 1) * 100), forecast.getRevenueChange());

        return forecast;
    }

    /**
     * 分析款式销售特征
     */
    private Map<String, StylePromotionProfile> analyzeStyleProfiles(List<ProductWarehousing> salesData) {
        Map<String, List<ProductWarehousing>> grouped = salesData.stream()
                .collect(Collectors.groupingBy(ProductWarehousing::getStyleNo));

        Map<String, StylePromotionProfile> profiles = new LinkedHashMap<>();

        for (Map.Entry<String, List<ProductWarehousing>> entry : grouped.entrySet()) {
            List<ProductWarehousing> records = entry.getValue();

            StylePromotionProfile profile = new StylePromotionProfile();
            profile.setStyleNo(entry.getKey());
            profile.setStyleName(records.get(0).getStyleName());
            profile.setRecordCount(records.size());

            // 计算总销量和均价
            int totalQty = records.stream()
                    .filter(r -> r.getQualifiedQuantity() != null)
                    .mapToInt(ProductWarehousing::getQualifiedQuantity)
                    .sum();
            profile.setTotalSales(totalQty);

            double avgPrice = records.stream()
                    .filter(r -> r.getUnitPrice() != null)
                    .mapToDouble(r -> r.getUnitPrice().doubleValue())
                    .average()
                    .orElse(0.0);
            profile.setAvgPrice(BigDecimal.valueOf(avgPrice).setScale(2, RoundingMode.HALF_UP));

            // 计算销售波动性
            List<Integer> dailySales = records.stream()
                    .filter(r -> r.getQualifiedQuantity() != null)
                    .map(ProductWarehousing::getQualifiedQuantity)
                    .collect(Collectors.toList());

            if (dailySales.size() > 1) {
                double mean = dailySales.stream().mapToInt(Integer::intValue).average().orElse(0);
                double variance = dailySales.stream()
                        .mapToDouble(v -> Math.pow(v - mean, 2))
                        .average()
                        .orElse(0);
                double stdDev = Math.sqrt(variance);
                profile.setSalesVolatility(stdDev / Math.max(mean, 1));
            }

            // 计算季节性得分
            profile.setSeasonalityScore((int) calculateSeasonality(records));

            // 计算促销敏感度评分
            profile.setPromotionSensitivityScore(calculateSensitivityScore(profile, dailySales));

            profiles.put(entry.getKey(), profile);
        }

        return profiles;
    }

    /**
     * 计算促销敏感度
     */
    private List<PromotionCandidate> calculatePromotionSensitivity(Map<String, StylePromotionProfile> profiles,
                                                                   String promotionType) {
        List<PromotionCandidate> candidates = new ArrayList<>();

        for (StylePromotionProfile profile : profiles.values()) {
            // 基于多个因素计算促销适配度
            double suitability = calculateSuitability(profile, promotionType);

            PromotionCandidate candidate = new PromotionCandidate();
            candidate.setStyleNo(profile.getStyleNo());
            candidate.setStyleName(profile.getStyleName());
            candidate.setTotalSales(profile.getTotalSales());
            candidate.setAvgPrice(profile.getAvgPrice());
            candidate.setSuitabilityScore((int) Math.round(suitability * 100));
            candidate.setRecommendedDiscount(String.valueOf(calculateRecommendedDiscount(suitability, promotionType)));
            candidate.setReason(generateReason(profile, suitability));

            candidates.add(candidate);
        }

        // 按适配度排序
        candidates.sort((a, b) -> Integer.compare(b.getSuitabilityScore(), a.getSuitabilityScore()));

        return candidates;
    }

    /**
     * 预测促销效果
     */
    private List<PromotionForecast> predictPromotionEffect(List<PromotionCandidate> candidates,
                                                             String promotionType) {
        List<PromotionForecast> forecasts = new ArrayList<>();

        for (PromotionCandidate candidate : candidates) {
            int discount = parseDiscount(candidate.getRecommendedDiscount());
            double lift = calculateSalesLift(discount, promotionType);

            PromotionForecast forecast = new PromotionForecast();
            forecast.setStyleNo(candidate.getStyleNo());
            forecast.setPromotionType(promotionType);
            forecast.setRecommendedDiscount(candidate.getRecommendedDiscount());

            // 计算销量提升
            int baseDaily = candidate.getTotalSales() / 30; // 估算日均
            int predictedDaily = (int) Math.round(baseDaily * lift);
            forecast.setEstimatedDailyLiftPercent((int) Math.round((lift - 1) * 100));
            forecast.setEstimatedDailySales(predictedDaily);

            // 计算销售额变化
            double price = candidate.getAvgPrice().doubleValue();
            double discountedPrice = price * (1 - discount / 100.0);
            double baselineDailyRevenue = baseDaily * price;
            double promotedDailyRevenue = predictedDaily * discountedPrice;
            forecast.setBaselineDailyRevenue(BigDecimal.valueOf(baselineDailyRevenue).setScale(2, RoundingMode.HALF_UP));
            forecast.setEstimatedDailyRevenue(BigDecimal.valueOf(promotedDailyRevenue).setScale(2, RoundingMode.HALF_UP));
            forecast.setDailyRevenueChange(promotedDailyRevenue - baselineDailyRevenue);

            // 计算置信度
            forecast.setConfidence(calculateConfidence(candidate.getRecordCount()));

            forecasts.add(forecast);
        }

        return forecasts;
    }

    /**
     * 生成推荐
     */
    private List<PromotionRecommendation> generateRecommendations(List<PromotionForecast> forecasts,
                                                                  String promotionType) {
        List<PromotionRecommendation> recommendations = new ArrayList<>();

        // 取前10个推荐
        for (int i = 0; i < Math.min(10, forecasts.size()); i++) {
            PromotionForecast forecast = forecasts.get(i);

            PromotionRecommendation rec = new PromotionRecommendation();
            rec.setRank(i + 1);
            rec.setStyleNo(forecast.getStyleNo());
            rec.setRecommendedDiscount(forecast.getRecommendedDiscount());
            rec.setEstimatedSalesLift(forecast.getEstimatedDailyLiftPercent());
            rec.setEstimatedRevenueChange(forecast.getDailyRevenueChange());
            rec.setConfidence(forecast.getConfidence());
            rec.setAction(String.format("建议%s参与%s促销，折扣%s，预计销量提升%d%%",
                    forecast.getStyleNo(), promotionType,
                    forecast.getRecommendedDiscount(), forecast.getEstimatedDailyLiftPercent()));

            recommendations.add(rec);
        }

        return recommendations;
    }

    /**
     * 计算促销敏感度评分
     */
    private double calculateSensitivityScore(StylePromotionProfile profile, List<Integer> dailySales) {
        double baseScore = 50; // 基础分

        // 销量波动大说明对促销敏感
        if (profile.getSalesVolatility() > 0.5) {
            baseScore += 15;
        } else if (profile.getSalesVolatility() > 0.2) {
            baseScore += 10;
        }

        // 季节性强说明对促销敏感
        baseScore += profile.getSeasonalityScore();

        // 高价商品促销空间大
        if (profile.getAvgPrice().doubleValue() > 500) {
            baseScore += 10;
        } else if (profile.getAvgPrice().doubleValue() > 200) {
            baseScore += 5;
        }

        return Math.min(baseScore, 100) / 100.0;
    }

    /**
     * 计算销量提升
     */
    private double calculateSalesLift(int discountPercent, String promotionType) {
        // 基于促销类型和折扣计算销量提升
        double baseLift = switch (promotionType) {
            case "DISCOUNT" -> 1 + discountPercent / 100.0 * 2.0; // 满减：折扣每1%带来2%销量提升
            case "COUPON" -> 1 + discountPercent / 100.0 * 1.5; // 优惠券：折扣每1%带来1.5%销量提升
            case "BUNDLE" -> 1.3; // 捆绑销售：30%提升
            case "GIVEAWAY" -> 1.25; // 赠品：25%提升
            default -> 1.2;
        };

        // 折扣过大会降低效果（消费者怀疑质量）
        if (discountPercent > 50) {
            baseLift *= 0.8;
        }

        return baseLift;
    }

    /**
     * 计算适配度
     */
    private double calculateSuitability(StylePromotionProfile profile, String promotionType) {
        double suitability = 0.4; // 基础分

        // 销量高说明有促销价值
        if (profile.getTotalSales() > 1000) {
            suitability += 0.2;
        } else if (profile.getTotalSales() > 500) {
            suitability += 0.15;
        } else if (profile.getTotalSales() > 100) {
            suitability += 0.1;
        }

        // 促销敏感度高
        suitability += profile.getPromotionSensitivityScore();

        // 季节性强
        suitability += profile.getSeasonalityScore() / 100.0;

        return Math.min(suitability, 1.0);
    }

    private int calculateRecommendedDiscount(double suitability, String promotionType) {
        if (suitability > 0.8) {
            return 20; // 高适配度，中等折扣
        } else if (suitability > 0.6) {
            return 15;
        } else {
            return 10;
        }
    }

    private String generateReason(StylePromotionProfile profile, double suitability) {
        StringBuilder reason = new StringBuilder();
        if (profile.getSalesVolatility() > 0.3) {
            reason.append("销量波动大，对促销敏感；");
        }
        if (profile.getSeasonalityScore() > 20) {
            reason.append("季节性强，当前可能处于销售旺季；");
        }
        if (profile.getAvgPrice().doubleValue() > 300) {
            reason.append("单价较高，促销空间大；");
        }
        if (suitability > 0.7) {
            reason.append("综合评分优秀，适合促销。");
        } else {
            reason.append("可作为备选促销款。");
        }
        return reason.toString();
    }

    private int parseDiscount(String discount) {
        if (discount == null) return 10;
        try {
            return Integer.parseInt(discount.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return 10;
        }
    }

    private double calculateSeasonality(List<ProductWarehousing> records) {
        // 简化的季节性计算：最近1个月销量占比
        if (records.size() < 2) return 0;

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime oneMonthAgo = now.minusMonths(1);

        int recentSales = records.stream()
                .filter(r -> r.getCreateTime().isAfter(oneMonthAgo))
                .filter(r -> r.getQualifiedQuantity() != null)
                .mapToInt(ProductWarehousing::getQualifiedQuantity)
                .sum();

        int totalSales = records.stream()
                .filter(r -> r.getQualifiedQuantity() != null)
                .mapToInt(ProductWarehousing::getQualifiedQuantity)
                .sum();

        if (totalSales == 0) return 0;

        double recentRatio = (double) recentSales / totalSales;
        // 如果最近销量占比超过30%，说明可能处于旺季
        return recentRatio > 0.3 ? 20 : recentRatio > 0.2 ? 10 : 0;
    }

    private double calculateOverallLift(List<PromotionRecommendation> recommendations) {
        if (recommendations.isEmpty()) return 0;
        return recommendations.stream()
                .mapToInt(PromotionRecommendation::getEstimatedSalesLift)
                .average()
                .orElse(0);
    }

    private String assessRisk(List<PromotionRecommendation> recommendations) {
        if (recommendations.isEmpty()) return "LOW";
        long highLiftCount = recommendations.stream()
                .filter(r -> r.getEstimatedSalesLift() > 50)
                .count();
        if (highLiftCount > 5) return "HIGH";
        if (highLiftCount > 2) return "MEDIUM";
        return "LOW";
    }

    private String assessSingleRisk(double lift, int discount) {
        if (lift > 2.0 || discount > 40) return "HIGH";
        if (lift > 1.5 || discount > 25) return "MEDIUM";
        return "LOW";
    }

    private int calculateConfidence(int recordCount) {
        if (recordCount >= 100) return 85;
        if (recordCount >= 50) return 70;
        if (recordCount >= 20) return 55;
        if (recordCount >= 10) return 40;
        return 25;
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class PromotionSelectionResponse {
        private String promotionType;
        private LocalDate targetDate;
        private LocalDate analysisDate;
        private int totalCandidates;
        private List<PromotionCandidate> promotionCandidates;
        private List<PromotionForecast> promotionForecasts;
        private List<PromotionRecommendation> recommendations;
        private double overallExpectedLift;
        private String riskLevel;
    }

    @Data
    public static class StylePromotionProfile {
        private String styleNo;
        private String styleName;
        private int recordCount;
        private int totalSales;
        private BigDecimal avgPrice;
        private double salesVolatility;
        private int seasonalityScore;
        private double promotionSensitivityScore;
    }

    @Data
    public static class PromotionCandidate {
        private String styleNo;
        private String styleName;
        private int totalSales;
        private BigDecimal avgPrice;
        private int suitabilityScore;
        private String recommendedDiscount;
        private String reason;
        private int recordCount;
    }

    @Data
    public static class PromotionForecast {
        private String styleNo;
        private String promotionType;
        private String recommendedDiscount;
        private int estimatedDailyLiftPercent;
        private int estimatedDailySales;
        private BigDecimal baselineDailyRevenue;
        private BigDecimal estimatedDailyRevenue;
        private double dailyRevenueChange;
        private int confidence;
    }

    @Data
    public static class PromotionRecommendation {
        private int rank;
        private String styleNo;
        private String recommendedDiscount;
        private int estimatedSalesLift;
        private double estimatedRevenueChange;
        private int confidence;
        private String action;
    }

    @Data
    public static class PromotionEffectForecast {
        private String styleNo;
        private String promotionType;
        private int discountPercent;
        private int durationDays;
        private int baselineAvgDailySales;
        private int estimatedSalesLift;
        private int estimatedDailySales;
        private int estimatedTotalSales;
        private BigDecimal baselineRevenue;
        private BigDecimal estimatedRevenue;
        private double revenueChange;
        private int confidence;
        private String riskLevel;
        private String note;
    }
}
