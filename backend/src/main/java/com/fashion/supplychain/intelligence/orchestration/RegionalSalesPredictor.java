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
 * 区域销量热力预测智能体
 *
 * 功能：
 * - 分析各区域的销售分布
 * - 预测区域销售趋势
 * - 提供区域扩张建议
 * - 生成区域热力图数据
 *
 * 核心价值：优化区域资源配置，提升区域销售
 */
@Service
@Lazy
@Slf4j
public class RegionalSalesPredictor {

    /**
     * 获取区域销量热力分析报告
     */
    public RegionalSalesResponse analyzeRegionalSales() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取区域销售数据
        List<RegionalSalesData> salesData = fetchRegionalSalesData(tenantId);

        // 计算区域统计
        List<RegionStats> regionStats = calculateRegionStats(salesData);

        // 预测区域销售
        List<RegionPrediction> predictions = predictRegionalSales(salesData);

        // 生成扩张建议
        List<RegionExpansion> expansions = generateExpansionSuggestions(regionStats);

        RegionalSalesResponse response = new RegionalSalesResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalRegions(regionStats.size());
        response.setTotalSales(salesData.stream().mapToInt(RegionalSalesData::getCurrentMonthSales).sum());
        response.setRegionStats(regionStats);
        response.setRegionPredictions(predictions);
        response.setExpansionSuggestions(expansions);

        log.info("[RegionalSales] 区域销量分析完成: regions={}, totalSales={}",
                regionStats.size(), response.getTotalSales());

        return response;
    }

    /**
     * 获取区域销售预测
     */
    public RegionPredictionResponse predictRegionalSales() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<RegionalSalesData> salesData = fetchRegionalSalesData(tenantId);

        List<RegionPrediction> predictions = salesData.stream()
                .map(data -> {
                    RegionPrediction prediction = new RegionPrediction();
                    prediction.setRegionCode(data.getRegionCode());
                    prediction.setRegionName(data.getRegionName());
                    prediction.setCurrentMonthSales(data.getCurrentMonthSales());
                    prediction.setGrowthRate(calculateGrowthRate(data.getLastMonthSales(), data.getCurrentMonthSales()));

                    double growth = prediction.getGrowthRate();
                    int nextMonthPrediction = (int) (data.getCurrentMonthSales() * (1 + growth));
                    prediction.setNextMonthPrediction(nextMonthPrediction);
                    prediction.setConfidence(growth > 0.15 ? 85 : growth > 0.05 ? 70 : 50);

                    return prediction;
                })
                .sorted((a, b) -> Integer.compare(b.getCurrentMonthSales(), a.getCurrentMonthSales()))
                .collect(Collectors.toList());

        RegionPredictionResponse response = new RegionPredictionResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalRegions(predictions.size());
        response.setRegionPredictions(predictions);

        return response;
    }

    /**
     * 获取区域热力图数据
     */
    public RegionHeatmapResponse getHeatmapData() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<RegionalSalesData> salesData = fetchRegionalSalesData(tenantId);

        List<HeatmapCell> heatmapCells = salesData.stream()
                .map(data -> {
                    HeatmapCell cell = new HeatmapCell();
                    cell.setRegionCode(data.getRegionCode());
                    cell.setRegionName(data.getRegionName());
                    cell.setSales(data.getCurrentMonthSales());
                    cell.setIntensity(calculateIntensity(data.getCurrentMonthSales()));
                    return cell;
                })
                .collect(Collectors.toList());

        RegionHeatmapResponse response = new RegionHeatmapResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setHeatmapCells(heatmapCells);

        return response;
    }

    /**
     * 模拟获取区域销售数据
     */
    private List<RegionalSalesData> fetchRegionalSalesData(Long tenantId) {
        List<RegionalSalesData> data = new ArrayList<>();

        data.add(new RegionalSalesData("BJ", "北京", 15000, 17000));
        data.add(new RegionalSalesData("SH", "上海", 20000, 23000));
        data.add(new RegionalSalesData("GZ", "广州", 12000, 14000));
        data.add(new RegionalSalesData("SZ", "深圳", 18000, 21000));
        data.add(new RegionalSalesData("CD", "成都", 8000, 9500));
        data.add(new RegionalSalesData("WH", "武汉", 7000, 8200));
        data.add(new RegionalSalesData("NJ", "南京", 6000, 6800));
        data.add(new RegionalSalesData("HZ", "杭州", 9000, 10500));
        data.add(new RegionalSalesData("XA", "西安", 5000, 5800));
        data.add(new RegionalSalesData("CS", "长沙", 4500, 5200));

        return data;
    }

    /**
     * 计算区域统计
     */
    private List<RegionStats> calculateRegionStats(List<RegionalSalesData> salesData) {
        return salesData.stream()
                .map(data -> {
                    RegionStats stats = new RegionStats();
                    stats.setRegionCode(data.getRegionCode());
                    stats.setRegionName(data.getRegionName());
                    stats.setLastMonthSales(data.getLastMonthSales());
                    stats.setCurrentMonthSales(data.getCurrentMonthSales());
                    stats.setGrowthRate(calculateGrowthRate(data.getLastMonthSales(), data.getCurrentMonthSales()));
                    stats.setContributionRate(calculateContributionRate(data.getCurrentMonthSales(), salesData));
                    return stats;
                })
                .sorted((a, b) -> Integer.compare(b.getCurrentMonthSales(), a.getCurrentMonthSales()))
                .collect(Collectors.toList());
    }

    /**
     * 预测区域销售
     */
    private List<RegionPrediction> predictRegionalSales(List<RegionalSalesData> salesData) {
        return salesData.stream()
                .map(data -> {
                    RegionPrediction prediction = new RegionPrediction();
                    prediction.setRegionCode(data.getRegionCode());
                    prediction.setRegionName(data.getRegionName());
                    prediction.setCurrentMonthSales(data.getCurrentMonthSales());

                    double growth = calculateGrowthRate(data.getLastMonthSales(), data.getCurrentMonthSales());
                    prediction.setGrowthRate(growth);

                    int nextMonth = (int) (data.getCurrentMonthSales() * (1 + growth));
                    prediction.setNextMonthPrediction(nextMonth);
                    prediction.setConfidence(growth > 0.15 ? 85 : growth > 0.05 ? 70 : 50);

                    return prediction;
                })
                .collect(Collectors.toList());
    }

    /**
     * 生成扩张建议
     */
    private List<RegionExpansion> generateExpansionSuggestions(List<RegionStats> regionStats) {
        List<RegionExpansion> expansions = new ArrayList<>();

        // 找出高增长区域
        List<RegionStats> highGrowthRegions = regionStats.stream()
                .filter(r -> r.getGrowthRate() > 0.1)
                .collect(Collectors.toList());

        for (RegionStats region : highGrowthRegions) {
            RegionExpansion expansion = new RegionExpansion();
            expansion.setRegionCode(region.getRegionCode());
            expansion.setRegionName(region.getRegionName());
            expansion.setGrowthRate(region.getGrowthRate());
            expansion.setCurrentSales(region.getCurrentMonthSales());
            expansion.setRecommendation("建议增加资源投入");
            expansion.setExpectedGrowth("预计下月增长15-25%");
            expansions.add(expansion);
        }

        return expansions;
    }

    private double calculateGrowthRate(int last, int current) {
        return last > 0 ? (current - last) / (double) last : 0;
    }

    private double calculateContributionRate(int sales, List<RegionalSalesData> allData) {
        int total = allData.stream().mapToInt(RegionalSalesData::getCurrentMonthSales).sum();
        return total > 0 ? sales / (double) total * 100 : 0;
    }

    private int calculateIntensity(int sales) {
        if (sales >= 15000) return 5;
        if (sales >= 10000) return 4;
        if (sales >= 6000) return 3;
        if (sales >= 3000) return 2;
        return 1;
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class RegionalSalesResponse {
        private LocalDate analysisDate;
        private int totalRegions;
        private int totalSales;
        private List<RegionStats> regionStats;
        private List<RegionPrediction> regionPredictions;
        private List<RegionExpansion> expansionSuggestions;
    }

    @Data
    public static class RegionStats {
        private String regionCode;
        private String regionName;
        private int lastMonthSales;
        private int currentMonthSales;
        private double growthRate;
        private double contributionRate;
    }

    @Data
    public static class RegionPrediction {
        private String regionCode;
        private String regionName;
        private int currentMonthSales;
        private double growthRate;
        private int nextMonthPrediction;
        private int confidence;
    }

    @Data
    public static class RegionExpansion {
        private String regionCode;
        private String regionName;
        private double growthRate;
        private int currentSales;
        private String recommendation;
        private String expectedGrowth;
    }

    @Data
    public static class RegionPredictionResponse {
        private LocalDate analysisDate;
        private int totalRegions;
        private List<RegionPrediction> regionPredictions;
    }

    @Data
    public static class RegionHeatmapResponse {
        private LocalDate analysisDate;
        private List<HeatmapCell> heatmapCells;
    }

    @Data
    public static class HeatmapCell {
        private String regionCode;
        private String regionName;
        private int sales;
        private int intensity;
    }

    // 内部数据类
    @Data
    public static class RegionalSalesData {
        private String regionCode;
        private String regionName;
        private int lastMonthSales;
        private int currentMonthSales;

        public RegionalSalesData(String regionCode, String regionName, int lastMonthSales, int currentMonthSales) {
            this.regionCode = regionCode;
            this.regionName = regionName;
            this.lastMonthSales = lastMonthSales;
            this.currentMonthSales = currentMonthSales;
        }
    }
}
