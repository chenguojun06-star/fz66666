package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 渠道销售分布预测智能体
 *
 * 功能：
 * - 分析各销售渠道的销售分布
 * - 预测各渠道的销售趋势
 * - 提供渠道优化建议
 * - 评估渠道绩效
 *
 * 核心价值：优化渠道资源配置，提升整体销售
 */
@Service
@Lazy
@Slf4j
public class ChannelSalesPredictor {

    @Autowired
    @Lazy
    private EcSalesRevenueService ecSalesRevenueService;

    private static final Map<String, String> PLATFORM_NAME_MAP = Map.of(
            "TB", "淘宝", "TM", "天猫", "JD", "京东", "PDD", "拼多多",
            "DY", "抖音", "XHS", "小红书", "WC", "微信小店", "SFY", "Shopify",
            "SY", "希音", "JST", "聚水潭"
    );

    /**
     * 获取渠道销售分布分析报告
     */
    public ChannelSalesResponse analyzeChannelSales(String styleNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取渠道销售数据
        List<ChannelSalesData> salesData = fetchChannelSalesData(tenantId, styleNo);

        // 计算各渠道销售统计
        List<ChannelStats> channelStats = calculateChannelStats(salesData);

        // 预测未来趋势
        List<ChannelPrediction> predictions = predictChannelSales(salesData);

        // 生成优化建议
        List<ChannelOptimization> optimizations = generateChannelOptimizations(channelStats);

        ChannelSalesResponse response = new ChannelSalesResponse();
        response.setStyleNo(styleNo);
        response.setAnalysisDate(LocalDate.now());
        response.setTotalChannels(channelStats.size());
        response.setTotalSales(salesData.stream().mapToInt(d -> d.getQ1() + d.getQ2() + d.getQ3() + d.getQ4()).sum());
        response.setChannelStats(channelStats);
        response.setChannelPredictions(predictions);
        response.setOptimizationSuggestions(optimizations);

        log.info("[ChannelSales] 渠道销售分析完成: styleNo={}, channels={}, totalSales={}",
                styleNo, channelStats.size(), response.getTotalSales());

        return response;
    }

    /**
     * 获取全渠道销售预测
     */
    public MultiChannelPredictionResponse predictMultiChannelSales(List<String> styleNos) {
        List<ChannelSalesResponse> responses = new ArrayList<>();

        for (String styleNo : styleNos) {
            try {
                ChannelSalesResponse response = analyzeChannelSales(styleNo);
                responses.add(response);
            } catch (Exception e) {
                log.warn("[ChannelSales] 分析失败: styleNo={}, error={}", styleNo, e.getMessage());
            }
        }

        // 汇总统计
        int totalChannels = responses.stream()
                .mapToInt(ChannelSalesResponse::getTotalChannels)
                .sum();
        int totalSales = responses.stream()
                .mapToInt(ChannelSalesResponse::getTotalSales)
                .sum();

        MultiChannelPredictionResponse response = new MultiChannelPredictionResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalStyles(responses.size());
        response.setTotalChannels(totalChannels);
        response.setTotalSales(totalSales);
        response.setStyleResponses(responses);

        return response;
    }

    /**
     * 获取渠道绩效评估报告
     */
    public ChannelPerformanceResponse evaluateChannelPerformance() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取渠道绩效数据
        List<ChannelPerformanceData> performanceData = fetchChannelPerformanceData(tenantId);

        // 计算绩效评分
        List<ChannelPerformance> performances = new ArrayList<>();
        for (ChannelPerformanceData data : performanceData) {
            ChannelPerformance performance = calculatePerformance(data);
            performances.add(performance);
        }

        // 排序
        performances.sort((a, b) -> Integer.compare(b.getPerformanceScore(), a.getPerformanceScore()));

        ChannelPerformanceResponse response = new ChannelPerformanceResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalChannels(performances.size());
        response.setChannelPerformances(performances);

        return response;
    }

    /**
     * 从 t_ec_sales_revenue 查询真实渠道销售数据，按平台分组按季度聚合
     */
    private List<ChannelSalesData> fetchChannelSalesData(Long tenantId, String styleNo) {
        List<EcSalesRevenue> records = querySalesRevenue(tenantId, styleNo);
        if (records.isEmpty()) {
            return Collections.emptyList();
        }
        Map<String, List<EcSalesRevenue>> byPlatform = records.stream()
                .filter(r -> StringUtils.hasText(r.getPlatform()))
                .collect(Collectors.groupingBy(EcSalesRevenue::getPlatform));
        int year = LocalDate.now().getYear();
        List<ChannelSalesData> result = new ArrayList<>();
        for (Map.Entry<String, List<EcSalesRevenue>> entry : byPlatform.entrySet()) {
            String platformName = PLATFORM_NAME_MAP.getOrDefault(entry.getKey(), entry.getKey());
            int q1 = sumQuantityByQuarter(entry.getValue(), year, 1, 3);
            int q2 = sumQuantityByQuarter(entry.getValue(), year, 4, 6);
            int q3 = sumQuantityByQuarter(entry.getValue(), year, 7, 9);
            int q4 = sumQuantityByQuarter(entry.getValue(), year, 10, 12);
            result.add(new ChannelSalesData(platformName, q1, q2, q3, q4));
        }
        return result;
    }

    /**
     * 从 t_ec_sales_revenue 查询真实渠道绩效数据
     */
    private List<ChannelPerformanceData> fetchChannelPerformanceData(Long tenantId) {
        List<EcSalesRevenue> records = querySalesRevenue(tenantId, null);
        if (records.isEmpty()) {
            return Collections.emptyList();
        }
        Map<String, List<EcSalesRevenue>> byPlatform = records.stream()
                .filter(r -> StringUtils.hasText(r.getPlatform()))
                .collect(Collectors.groupingBy(EcSalesRevenue::getPlatform));
        List<ChannelPerformanceData> result = new ArrayList<>();
        for (Map.Entry<String, List<EcSalesRevenue>> entry : byPlatform.entrySet()) {
            String platformName = PLATFORM_NAME_MAP.getOrDefault(entry.getKey(), entry.getKey());
            List<EcSalesRevenue> list = entry.getValue();
            int salesVolume = list.stream().mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
            BigDecimal revenueBd = list.stream()
                    .map(r -> r.getPayAmount() != null ? r.getPayAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            int revenue = revenueBd.intValue();
            double avgPrice = salesVolume > 0 ? revenueBd.divide(BigDecimal.valueOf(salesVolume), 2, java.math.RoundingMode.HALF_UP).doubleValue() : 0;
            int fulfillmentRate = list.stream()
                    .filter(r -> "reconciled".equals(r.getStatus()))
                    .mapToInt(r -> 1).sum();
            int fulfillmentPct = list.isEmpty() ? 0 : (fulfillmentRate * 100 / list.size());
            result.add(new ChannelPerformanceData(platformName, salesVolume, revenue, avgPrice, fulfillmentPct, 0));
        }
        return result;
    }

    private List<EcSalesRevenue> querySalesRevenue(Long tenantId, String styleNo) {
        try {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EcSalesRevenue> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
            wrapper.eq(EcSalesRevenue::getTenantId, tenantId);
            wrapper.last("LIMIT 5000");
            return ecSalesRevenueService.list(wrapper);
        } catch (Exception e) {
            log.warn("[ChannelSalesPredictor] 查询销售数据失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private int sumQuantityByQuarter(List<EcSalesRevenue> records, int year, int startMonth, int endMonth) {
        return records.stream()
                .filter(r -> {
                    LocalDateTime t = r.getShipTime() != null ? r.getShipTime() : r.getCreateTime();
                    if (t == null) return false;
                    return t.getYear() == year && t.getMonthValue() >= startMonth && t.getMonthValue() <= endMonth;
                })
                .mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0)
                .sum();
    }

    /**
     * 计算渠道统计
     */
    private List<ChannelStats> calculateChannelStats(List<ChannelSalesData> salesData) {
        return salesData.stream()
                .map(data -> {
                    ChannelStats stats = new ChannelStats();
                    stats.setChannelName(data.getChannelName());
                    stats.setQ1Sales(data.getQ1());
                    stats.setQ2Sales(data.getQ2());
                    stats.setQ3Sales(data.getQ3());
                    stats.setQ4Sales(data.getQ4());
                    stats.setTotalSales(data.getQ1() + data.getQ2() + data.getQ3() + data.getQ4());
                    stats.setGrowthRate(calculateGrowthRate(data.getQ1(), data.getQ4()));
                    return stats;
                })
                .collect(Collectors.toList());
    }

    /**
     * 预测渠道销售
     */
    private List<ChannelPrediction> predictChannelSales(List<ChannelSalesData> salesData) {
        return salesData.stream()
                .map(data -> {
                    ChannelPrediction prediction = new ChannelPrediction();
                    prediction.setChannelName(data.getChannelName());

                    // 基于增长率预测下季度
                    double growth = calculateGrowthRate(data.getQ1(), data.getQ4());
                    int nextQuarterPrediction = (int) (data.getQ4() * (1 + growth));
                    prediction.setNextQuarterPrediction(nextQuarterPrediction);
                    prediction.setConfidence(growth > 0.2 ? 85 : growth > 0.1 ? 70 : 50);
                    prediction.setTrend(growth > 0.15 ? "UP" : growth < -0.1 ? "DOWN" : "STABLE");

                    return prediction;
                })
                .collect(Collectors.toList());
    }

    /**
     * 生成渠道优化建议
     */
    private List<ChannelOptimization> generateChannelOptimizations(List<ChannelStats> channelStats) {
        List<ChannelOptimization> optimizations = new ArrayList<>();

        // 找出表现最好和最差的渠道
        ChannelStats bestChannel = channelStats.stream()
                .max(Comparator.comparing(ChannelStats::getGrowthRate))
                .orElse(null);

        ChannelStats worstChannel = channelStats.stream()
                .min(Comparator.comparing(ChannelStats::getGrowthRate))
                .orElse(null);

        if (bestChannel != null && bestChannel.getGrowthRate() > 0.2) {
            ChannelOptimization opt = new ChannelOptimization();
            opt.setChannelName(bestChannel.getChannelName());
            opt.setOptimizationType("INVEST");
            opt.setDescription(String.format("%s渠道增长%.1f%%，表现优秀",
                    bestChannel.getChannelName(), bestChannel.getGrowthRate() * 100));
            opt.setRecommendation("建议增加该渠道的资源投入");
            opt.setExpectedImpact("预计销量增长15-25%");
            optimizations.add(opt);
        }

        if (worstChannel != null && worstChannel.getGrowthRate() < 0) {
            ChannelOptimization opt = new ChannelOptimization();
            opt.setChannelName(worstChannel.getChannelName());
            opt.setOptimizationType("OPTIMIZE");
            opt.setDescription(String.format("%s渠道增长%.1f%%，表现不佳",
                    worstChannel.getChannelName(), worstChannel.getGrowthRate() * 100));
            opt.setRecommendation("建议分析问题原因，优化运营策略");
            opt.setExpectedImpact("预计销量提升10-20%");
            optimizations.add(opt);
        }

        return optimizations;
    }

    /**
     * 计算绩效评分
     */
    private ChannelPerformance calculatePerformance(ChannelPerformanceData data) {
        ChannelPerformance performance = new ChannelPerformance();
        performance.setChannelName(data.getChannelName());
        performance.setSalesVolume(data.getSalesVolume());
        performance.setRevenue(data.getRevenue());
        performance.setCustomerRating(data.getCustomerRating());
        performance.setFulfillmentRate(data.getFulfillmentRate());
        performance.setReturnRate(data.getReturnRate());

        // 综合评分
        int score = 0;
        score += Math.min(data.getSalesVolume() / 20, 25);
        score += Math.min(data.getRevenue() / 10000, 25);
        score += (int) (data.getCustomerRating() * 5);
        score += data.getFulfillmentRate() / 4;
        score += Math.max(0, 20 - data.getReturnRate() / 2);

        performance.setPerformanceScore(Math.min(score, 100));
        performance.setPerformanceLevel(score >= 90 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 50 ? "FAIR" : "POOR");

        return performance;
    }

    private double calculateGrowthRate(int start, int end) {
        return start > 0 ? (end - start) / (double) start : 0;
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class ChannelSalesResponse {
        private String styleNo;
        private LocalDate analysisDate;
        private int totalChannels;
        private int totalSales;
        private List<ChannelStats> channelStats;
        private List<ChannelPrediction> channelPredictions;
        private List<ChannelOptimization> optimizationSuggestions;
    }

    @Data
    public static class ChannelStats {
        private String channelName;
        private int q1Sales;
        private int q2Sales;
        private int q3Sales;
        private int q4Sales;
        private int totalSales;
        private double growthRate;
    }

    @Data
    public static class ChannelPrediction {
        private String channelName;
        private int nextQuarterPrediction;
        private int confidence;
        private String trend;
    }

    @Data
    public static class ChannelOptimization {
        private String channelName;
        private String optimizationType;
        private String description;
        private String recommendation;
        private String expectedImpact;
    }

    @Data
    public static class MultiChannelPredictionResponse {
        private LocalDate analysisDate;
        private int totalStyles;
        private int totalChannels;
        private int totalSales;
        private List<ChannelSalesResponse> styleResponses;
    }

    @Data
    public static class ChannelPerformanceResponse {
        private LocalDate analysisDate;
        private int totalChannels;
        private List<ChannelPerformance> channelPerformances;
    }

    @Data
    public static class ChannelPerformance {
        private String channelName;
        private int salesVolume;
        private int revenue;
        private double customerRating;
        private int fulfillmentRate;
        private int returnRate;
        private int performanceScore;
        private String performanceLevel;
    }

    // 内部数据类
    @Data
    public static class ChannelSalesData {
        private String channelName;
        private int q1;
        private int q2;
        private int q3;
        private int q4;

        public ChannelSalesData(String channelName, int q1, int q2, int q3, int q4) {
            this.channelName = channelName;
            this.q1 = q1;
            this.q2 = q2;
            this.q3 = q3;
            this.q4 = q4;
        }
    }

    @Data
    public static class ChannelPerformanceData {
        private String channelName;
        private int salesVolume;
        private int revenue;
        private double customerRating;
        private int fulfillmentRate;
        private int returnRate;

        public ChannelPerformanceData(String channelName, int salesVolume, int revenue,
                                      double customerRating, int fulfillmentRate, int returnRate) {
            this.channelName = channelName;
            this.salesVolume = salesVolume;
            this.revenue = revenue;
            this.customerRating = customerRating;
            this.fulfillmentRate = fulfillmentRate;
            this.returnRate = returnRate;
        }
    }
}
