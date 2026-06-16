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
 * 外协工厂动态评分与推荐智能体
 *
 * 功能：
 * - 评估外协工厂绩效
 * - 动态更新工厂评分
 * - 推荐最优外协工厂
 * - 生成工厂绩效报告
 *
 * 核心价值：帮助选择最优外协工厂，提升供应链效率
 */
@Service
@Lazy
@Slf4j
public class OutsourcingFactoryRecommender {

    /**
     * 获取外协工厂绩效评估报告
     */
    public FactoryPerformanceResponse evaluateFactoryPerformance() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取工厂数据
        List<FactoryData> factoryData = fetchFactoryData(tenantId);

        // 计算工厂绩效
        List<FactoryPerformance> performances = factoryData.stream()
                .map(this::calculateFactoryPerformance)
                .sorted((a, b) -> Integer.compare(b.getPerformanceScore(), a.getPerformanceScore()))
                .collect(Collectors.toList());

        FactoryPerformanceResponse response = new FactoryPerformanceResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalFactories(performances.size());
        response.setFactoryPerformances(performances);

        log.info("[OutsourcingFactory] 工厂绩效评估完成: factories={}", performances.size());

        return response;
    }

    /**
     * 获取外协工厂推荐
     */
    public FactoryRecommendationResponse recommendFactories(String criteria) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<FactoryData> factoryData = fetchFactoryData(tenantId);

        // 根据条件筛选和排序
        List<FactoryRecommendation> recommendations = factoryData.stream()
                .map(data -> {
                    FactoryRecommendation rec = new FactoryRecommendation();
                    rec.setFactoryId(data.getFactoryId());
                    rec.setFactoryName(data.getFactoryName());
                    rec.setLocation(data.getLocation());
                    rec.setSpecialty(data.getSpecialty());
                    rec.setCapacity(data.getCapacity());
                    rec.setPerformanceScore(calculatePerformanceScore(data));
                    rec.setMatchScore(calculateMatchScore(data, criteria));
                    rec.setOverallScore((int) (rec.getPerformanceScore() * 0.7 + rec.getMatchScore() * 0.3));
                    return rec;
                })
                .sorted((a, b) -> Integer.compare(b.getOverallScore(), a.getOverallScore()))
                .limit(5)
                .collect(Collectors.toList());

        FactoryRecommendationResponse response = new FactoryRecommendationResponse();
        response.setRecommendationCriteria(criteria);
        response.setAnalysisDate(LocalDate.now());
        response.setRecommendedFactories(recommendations);

        return response;
    }

    /**
     * 获取工厂对比分析
     */
    public FactoryComparisonResponse compareFactories(List<String> factoryIds) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<FactoryData> factoryData = fetchFactoryData(tenantId);

        List<FactoryComparisonItem> comparisons = factoryData.stream()
                .filter(f -> factoryIds.contains(f.getFactoryId()))
                .map(data -> {
                    FactoryComparisonItem item = new FactoryComparisonItem();
                    item.setFactoryId(data.getFactoryId());
                    item.setFactoryName(data.getFactoryName());
                    item.setLocation(data.getLocation());
                    item.setSpecialty(data.getSpecialty());
                    item.setCapacity(data.getCapacity());
                    item.setOnTimeRate(data.getOnTimeRate());
                    item.setQualityRate(data.getQualityRate());
                    item.setCostLevel(data.getCostLevel());
                    item.setDeliveryLeadTime(data.getDeliveryLeadTime());
                    item.setPerformanceScore(calculatePerformanceScore(data));
                    return item;
                })
                .collect(Collectors.toList());

        FactoryComparisonResponse response = new FactoryComparisonResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setComparedFactories(comparisons);

        return response;
    }

    /**
     * 获取工厂能力矩阵
     */
    public FactoryCapabilityMatrixResponse getCapabilityMatrix() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<FactoryData> factoryData = fetchFactoryData(tenantId);

        List<CapabilityMatrixItem> matrix = factoryData.stream()
                .map(data -> {
                    CapabilityMatrixItem item = new CapabilityMatrixItem();
                    item.setFactoryId(data.getFactoryId());
                    item.setFactoryName(data.getFactoryName());
                    item.setSpecialty(data.getSpecialty());
                    item.setCapacity(data.getCapacity());
                    item.setQualityLevel(data.getQualityRate() >= 95 ? "HIGH" : data.getQualityRate() >= 90 ? "MEDIUM" : "LOW");
                    item.setCostEfficiency(data.getCostLevel() <= 2 ? "HIGH" : data.getCostLevel() <= 3 ? "MEDIUM" : "LOW");
                    item.setDeliverySpeed(data.getDeliveryLeadTime() <= 3 ? "FAST" : data.getDeliveryLeadTime() <= 5 ? "NORMAL" : "SLOW");
                    return item;
                })
                .collect(Collectors.toList());

        FactoryCapabilityMatrixResponse response = new FactoryCapabilityMatrixResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setCapabilityMatrix(matrix);

        return response;
    }

    /**
     * 模拟获取工厂数据
     */
    private List<FactoryData> fetchFactoryData(Long tenantId) {
        List<FactoryData> data = new ArrayList<>();

        data.add(new FactoryData("F001", "深圳卓越制衣厂", "深圳", "针织", 50000, 98, 96, 2, 2));
        data.add(new FactoryData("F002", "东莞恒丰服装", "东莞", "梭织", 80000, 95, 94, 2, 3));
        data.add(new FactoryData("F003", "广州华美服饰", "广州", "牛仔", 60000, 92, 95, 3, 4));
        data.add(new FactoryData("F004", "杭州锦绣纺织", "杭州", "丝绸", 30000, 99, 98, 4, 5));
        data.add(new FactoryData("F005", "温州腾飞制衣", "温州", "休闲装", 70000, 90, 92, 2, 3));
        data.add(new FactoryData("F006", "宁波恒通服饰", "宁波", "羽绒服", 40000, 96, 97, 3, 4));

        return data;
    }

    /**
     * 计算工厂绩效
     */
    private FactoryPerformance calculateFactoryPerformance(FactoryData data) {
        FactoryPerformance performance = new FactoryPerformance();
        performance.setFactoryId(data.getFactoryId());
        performance.setFactoryName(data.getFactoryName());
        performance.setLocation(data.getLocation());
        performance.setSpecialty(data.getSpecialty());
        performance.setCapacity(data.getCapacity());
        performance.setOnTimeRate(data.getOnTimeRate());
        performance.setQualityRate(data.getQualityRate());
        performance.setCostLevel(data.getCostLevel());
        performance.setDeliveryLeadTime(data.getDeliveryLeadTime());

        int score = calculatePerformanceScore(data);
        performance.setPerformanceScore(score);
        performance.setPerformanceLevel(score >= 90 ? "EXCELLENT" : score >= 75 ? "GOOD" : score >= 60 ? "FAIR" : "POOR");

        return performance;
    }

    /**
     * 计算绩效评分
     */
    private int calculatePerformanceScore(FactoryData data) {
        int score = 0;

        // 准时交货率 (30分)
        score += Math.min(data.getOnTimeRate() * 0.3, 30);

        // 质量合格率 (30分)
        score += Math.min(data.getQualityRate() * 0.3, 30);

        // 成本水平 (20分) - 成本越低分数越高
        score += Math.max(0, 20 - data.getCostLevel() * 4);

        // 交付周期 (20分) - 周期越短分数越高
        score += Math.max(0, 20 - data.getDeliveryLeadTime() * 3);

        return Math.min((int) score, 100);
    }

    /**
     * 计算匹配分数
     */
    private int calculateMatchScore(FactoryData data, String criteria) {
        if (criteria == null || criteria.isEmpty()) {
            return 50;
        }

        int score = 50;
        String lowerCriteria = criteria.toLowerCase();

        // 地区匹配
        if (lowerCriteria.contains(data.getLocation().toLowerCase())) {
            score += 20;
        }

        // 专长匹配
        if (lowerCriteria.contains(data.getSpecialty().toLowerCase())) {
            score += 20;
        }

        // 能力匹配
        if (lowerCriteria.contains("高质量") && data.getQualityRate() >= 95) {
            score += 10;
        }
        if (lowerCriteria.contains("低成本") && data.getCostLevel() <= 2) {
            score += 10;
        }
        if (lowerCriteria.contains("快交付") && data.getDeliveryLeadTime() <= 3) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class FactoryPerformanceResponse {
        private LocalDate analysisDate;
        private int totalFactories;
        private List<FactoryPerformance> factoryPerformances;
    }

    @Data
    public static class FactoryPerformance {
        private String factoryId;
        private String factoryName;
        private String location;
        private String specialty;
        private int capacity;
        private int onTimeRate;
        private int qualityRate;
        private int costLevel;
        private int deliveryLeadTime;
        private int performanceScore;
        private String performanceLevel;
    }

    @Data
    public static class FactoryRecommendationResponse {
        private String recommendationCriteria;
        private LocalDate analysisDate;
        private List<FactoryRecommendation> recommendedFactories;
    }

    @Data
    public static class FactoryRecommendation {
        private String factoryId;
        private String factoryName;
        private String location;
        private String specialty;
        private int capacity;
        private int performanceScore;
        private int matchScore;
        private int overallScore;
    }

    @Data
    public static class FactoryComparisonResponse {
        private LocalDate analysisDate;
        private List<FactoryComparisonItem> comparedFactories;
    }

    @Data
    public static class FactoryComparisonItem {
        private String factoryId;
        private String factoryName;
        private String location;
        private String specialty;
        private int capacity;
        private int onTimeRate;
        private int qualityRate;
        private int costLevel;
        private int deliveryLeadTime;
        private int performanceScore;
    }

    @Data
    public static class FactoryCapabilityMatrixResponse {
        private LocalDate analysisDate;
        private List<CapabilityMatrixItem> capabilityMatrix;
    }

    @Data
    public static class CapabilityMatrixItem {
        private String factoryId;
        private String factoryName;
        private String specialty;
        private int capacity;
        private String qualityLevel;
        private String costEfficiency;
        private String deliverySpeed;
    }

    // 内部数据类
    @Data
    public static class FactoryData {
        private String factoryId;
        private String factoryName;
        private String location;
        private String specialty;
        private int capacity;
        private int onTimeRate;
        private int qualityRate;
        private int costLevel;
        private int deliveryLeadTime;

        public FactoryData(String factoryId, String factoryName, String location, String specialty,
                          int capacity, int onTimeRate, int qualityRate, int costLevel, int deliveryLeadTime) {
            this.factoryId = factoryId;
            this.factoryName = factoryName;
            this.location = location;
            this.specialty = specialty;
            this.capacity = capacity;
            this.onTimeRate = onTimeRate;
            this.qualityRate = qualityRate;
            this.costLevel = costLevel;
            this.deliveryLeadTime = deliveryLeadTime;
        }
    }
}
