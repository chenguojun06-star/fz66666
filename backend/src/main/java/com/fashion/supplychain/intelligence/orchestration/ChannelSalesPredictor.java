package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
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
     * 模拟获取渠道销售数据
     */
    private List<ChannelSalesData> fetchChannelSalesData(Long tenantId, String styleNo) {
        List<ChannelSalesData> data = new ArrayList<>();

        data.add(new ChannelSalesData("天猫", 1200, 1500, 1800, 2000));
        data.add(new ChannelSalesData("抖音", 800, 1200, 1500, 1800));
        data.add(new ChannelSalesData("京东", 600, 700, 800, 900));
        data.add(new ChannelSalesData("拼多多", 400, 500, 600, 750));
        data.add(new ChannelSalesData("线下门店", 500, 450, 480, 520));
        data.add(new ChannelSalesData("私域", 200, 350, 500, 700));

        return data;
    }

    /**
     * 模拟获取渠道绩效数据
     */
    private List<ChannelPerformanceData> fetchChannelPerformanceData(Long tenantId) {
        List<ChannelPerformanceData> data = new ArrayList<>();

        data.add(new ChannelPerformanceData("天猫", 1200, 240000, 4.2, 85, 30));
        data.add(new ChannelPerformanceData("抖音", 1800, 180000, 4.5, 92, 15));
        data.add(new ChannelPerformanceData("京东", 900, 270000, 4.8, 95, 12));
        data.add(new ChannelPerformanceData("拼多多", 750, 75000, 3.8, 78, 45));
        data.add(new ChannelPerformanceData("线下门店", 520, 156000, 4.9, 98, 5));
        data.add(new ChannelPerformanceData("私域", 700, 175000, 4.7, 90, 8));

        return data;
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
