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
 * 业务指标健康度诊断智能体
 *
 * 功能：
 * - 监控关键业务指标
 * - 诊断业务健康状况
 * - 提供改进建议
 * - 生成健康度报告
 *
 * 核心价值：帮助管理者实时了解业务健康状况
 */
@Service
@Lazy
@Slf4j
public class BusinessHealthDiagnostic {

    /**
     * 获取业务健康度诊断报告
     */
    public HealthDiagnosticResponse diagnoseBusinessHealth() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取业务指标数据
        List<MetricData> metrics = fetchBusinessMetrics(tenantId);

        // 计算各维度健康度
        List<DimensionHealth> dimensionHealths = calculateDimensionHealth(metrics);

        // 计算整体健康度
        OverallHealth overallHealth = calculateOverallHealth(dimensionHealths);

        // 识别问题指标
        List<ProblemMetric> problems = identifyProblemMetrics(metrics);

        // 生成改进建议
        List<ImprovementAction> actions = generateImprovementActions(problems, dimensionHealths);

        HealthDiagnosticResponse response = new HealthDiagnosticResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setOverallHealth(overallHealth);
        response.setDimensionHealths(dimensionHealths);
        response.setProblemMetrics(problems);
        response.setImprovementActions(actions);

        log.info("[BusinessHealth] 业务健康度诊断完成: overallScore={}, dimensions={}, problems={}",
                overallHealth.getHealthScore(), dimensionHealths.size(), problems.size());

        return response;
    }

    /**
     * 获取关键绩效指标报告
     */
    public KpiReportResponse getKpiReport() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<MetricData> metrics = fetchBusinessMetrics(tenantId);

        List<KpiItem> kpis = metrics.stream()
                .map(m -> {
                    KpiItem kpi = new KpiItem();
                    kpi.setMetricName(m.getMetricName());
                    kpi.setDimension(m.getDimension());
                    kpi.setCurrentValue(m.getCurrentValue());
                    kpi.setTargetValue(m.getTargetValue());
                    kpi.setUnit(m.getUnit());
                    kpi.setAchievementRate(m.getTargetValue() > 0 ?
                            (int) (m.getCurrentValue() / m.getTargetValue() * 100) : 0);
                    kpi.setStatus(m.getCurrentValue() >= m.getTargetValue() ? "ACHIEVED" : "PENDING");
                    return kpi;
                })
                .collect(Collectors.toList());

        KpiReportResponse response = new KpiReportResponse();
        response.setReportDate(LocalDate.now());
        response.setTotalKpis(kpis.size());
        response.setAchievedCount((int) kpis.stream().filter(k -> "ACHIEVED".equals(k.getStatus())).count());
        response.setKpiItems(kpis);

        return response;
    }

    /**
     * 获取指标趋势分析
     */
    public MetricTrendResponse getMetricTrend(String metricName) {
        TenantAssert.assertTenantContext();

        List<TrendPoint> trendPoints = generateTrendData(metricName);

        MetricTrendResponse response = new MetricTrendResponse();
        response.setMetricName(metricName);
        response.setAnalysisDate(LocalDate.now());
        response.setTrendPoints(trendPoints);

        return response;
    }

    /**
     * 模拟获取业务指标数据
     */
    private List<MetricData> fetchBusinessMetrics(Long tenantId) {
        List<MetricData> metrics = new ArrayList<>();

        // 销售维度
        metrics.add(new MetricData("销售额", "SALES", 850000, 1000000, "元"));
        metrics.add(new MetricData("订单数量", "SALES", 4200, 5000, "单"));
        metrics.add(new MetricData("客单价", "SALES", 202, 180, "元"));

        // 库存维度
        metrics.add(new MetricData("库存周转率", "INVENTORY", 4.2, 5.0, "次/年"));
        metrics.add(new MetricData("缺货率", "INVENTORY", 3.5, 2.0, "%"));
        metrics.add(new MetricData("库存天数", "INVENTORY", 65, 45, "天"));

        // 生产维度
        metrics.add(new MetricData("准时交货率", "PRODUCTION", 92, 95, "%"));
        metrics.add(new MetricData("生产效率", "PRODUCTION", 85, 90, "%"));
        metrics.add(new MetricData("次品率", "PRODUCTION", 2.5, 2.0, "%"));

        // 财务维度
        metrics.add(new MetricData("毛利率", "FINANCE", 32, 35, "%"));
        metrics.add(new MetricData("回款周期", "FINANCE", 45, 30, "天"));
        metrics.add(new MetricData("成本控制率", "FINANCE", 95, 98, "%"));

        // 客户维度
        metrics.add(new MetricData("客户满意度", "CUSTOMER", 4.6, 4.8, "分"));
        metrics.add(new MetricData("客户复购率", "CUSTOMER", 35, 40, "%"));
        metrics.add(new MetricData("退货率", "CUSTOMER", 8, 5, "%"));

        return metrics;
    }

    /**
     * 计算各维度健康度
     */
    private List<DimensionHealth> calculateDimensionHealth(List<MetricData> metrics) {
        Map<String, List<MetricData>> groupedByDimension = metrics.stream()
                .collect(Collectors.groupingBy(MetricData::getDimension));

        List<DimensionHealth> dimensionHealths = new ArrayList<>();

        for (Map.Entry<String, List<MetricData>> entry : groupedByDimension.entrySet()) {
            DimensionHealth health = new DimensionHealth();
            health.setDimension(entry.getKey());
            health.setDimensionName(getDimensionName(entry.getKey()));

            List<MetricData> dimMetrics = entry.getValue();
            int score = 0;
            int achieved = 0;

            for (MetricData metric : dimMetrics) {
                double achievementRate = metric.getTargetValue() > 0 ?
                        metric.getCurrentValue() / metric.getTargetValue() : 0;

                if (achievementRate >= 1) {
                    score += 100;
                    achieved++;
                } else if (achievementRate >= 0.8) {
                    score += 80;
                } else if (achievementRate >= 0.6) {
                    score += 60;
                } else {
                    score += 40;
                }
            }

            health.setHealthScore(dimMetrics.isEmpty() ? 0 : score / dimMetrics.size());
            health.setAchievedCount(achieved);
            health.setTotalMetrics(dimMetrics.size());
            health.setHealthLevel(classifyHealthLevel(health.getHealthScore()));

            dimensionHealths.add(health);
        }

        return dimensionHealths;
    }

    /**
     * 计算整体健康度
     */
    private OverallHealth calculateOverallHealth(List<DimensionHealth> dimensionHealths) {
        OverallHealth overall = new OverallHealth();

        int totalScore = dimensionHealths.stream()
                .mapToInt(DimensionHealth::getHealthScore)
                .sum();

        overall.setHealthScore(dimensionHealths.isEmpty() ? 0 : totalScore / dimensionHealths.size());
        overall.setHealthLevel(classifyHealthLevel(overall.getHealthScore()));
        overall.setTotalDimensions(dimensionHealths.size());

        long healthyCount = dimensionHealths.stream()
                .filter(d -> "HEALTHY".equals(d.getHealthLevel()))
                .count();
        overall.setHealthyDimensions((int) healthyCount);

        return overall;
    }

    /**
     * 识别问题指标
     */
    private List<ProblemMetric> identifyProblemMetrics(List<MetricData> metrics) {
        return metrics.stream()
                .filter(m -> {
                    double achievementRate = m.getTargetValue() > 0 ?
                            m.getCurrentValue() / m.getTargetValue() : 0;
                    return achievementRate < 0.8;
                })
                .map(m -> {
                    ProblemMetric problem = new ProblemMetric();
                    problem.setMetricName(m.getMetricName());
                    problem.setDimension(m.getDimension());
                    problem.setCurrentValue(m.getCurrentValue());
                    problem.setTargetValue(m.getTargetValue());
                    problem.setUnit(m.getUnit());
                    problem.setAchievementRate(m.getTargetValue() > 0 ?
                            (int) (m.getCurrentValue() / m.getTargetValue() * 100) : 0);
                    problem.setSeverity(problem.getAchievementRate() < 60 ? "HIGH" : "MEDIUM");
                    return problem;
                })
                .sorted((a, b) -> Integer.compare(a.getAchievementRate(), b.getAchievementRate()))
                .collect(Collectors.toList());
    }

    /**
     * 生成改进建议
     */
    private List<ImprovementAction> generateImprovementActions(List<ProblemMetric> problems,
                                                               List<DimensionHealth> dimensions) {
        List<ImprovementAction> actions = new ArrayList<>();

        // 针对低健康度维度生成建议
        for (DimensionHealth dim : dimensions) {
            if ("WARNING".equals(dim.getHealthLevel()) || "CRITICAL".equals(dim.getHealthLevel())) {
                ImprovementAction action = new ImprovementAction();
                action.setPriority(dim.getHealthScore() < 50 ? "URGENT" : "HIGH");
                action.setTargetDimension(dim.getDimension());
                action.setTargetDimensionName(dim.getDimensionName());
                action.setDescription(String.format("%s维度健康度%d分，需要关注",
                        dim.getDimensionName(), dim.getHealthScore()));
                action.setRecommendedActions(getDimensionRecommendations(dim.getDimension()));
                actions.add(action);
            }
        }

        return actions;
    }

    /**
     * 生成趋势数据
     */
    private List<TrendPoint> generateTrendData(String metricName) {
        List<TrendPoint> points = new ArrayList<>();
        Random random = new Random(42);

        for (int i = 6; i >= 0; i--) {
            LocalDate date = LocalDate.now().minusMonths(i);
            double value = 80 + random.nextDouble() * 20;
            points.add(new TrendPoint(date.toString(), value));
        }

        return points;
    }

    private String getDimensionName(String dimension) {
        Map<String, String> names = new HashMap<>();
        names.put("SALES", "销售");
        names.put("INVENTORY", "库存");
        names.put("PRODUCTION", "生产");
        names.put("FINANCE", "财务");
        names.put("CUSTOMER", "客户");
        return names.getOrDefault(dimension, dimension);
    }

    private String classifyHealthLevel(int score) {
        if (score >= 85) return "HEALTHY";
        if (score >= 60) return "WARNING";
        return "CRITICAL";
    }

    private List<String> getDimensionRecommendations(String dimension) {
        Map<String, List<String>> recommendations = new HashMap<>();

        recommendations.put("SALES", Arrays.asList(
                "分析销售下降原因",
                "优化营销策略",
                "拓展销售渠道",
                "提升客户服务"
        ));

        recommendations.put("INVENTORY", Arrays.asList(
                "优化库存管理",
                "清理滞销库存",
                "优化补货策略",
                "提升库存周转率"
        ));

        recommendations.put("PRODUCTION", Arrays.asList(
                "提升生产效率",
                "优化生产流程",
                "降低次品率",
                "提高准时交货率"
        ));

        recommendations.put("FINANCE", Arrays.asList(
                "优化成本控制",
                "加快回款速度",
                "提升毛利率",
                "优化财务流程"
        ));

        recommendations.put("CUSTOMER", Arrays.asList(
                "提升客户满意度",
                "优化售后服务",
                "降低退货率",
                "提升客户复购率"
        ));

        return recommendations.getOrDefault(dimension, Collections.emptyList());
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class HealthDiagnosticResponse {
        private LocalDate analysisDate;
        private OverallHealth overallHealth;
        private List<DimensionHealth> dimensionHealths;
        private List<ProblemMetric> problemMetrics;
        private List<ImprovementAction> improvementActions;
    }

    @Data
    public static class OverallHealth {
        private int healthScore;
        private String healthLevel;
        private int totalDimensions;
        private int healthyDimensions;
    }

    @Data
    public static class DimensionHealth {
        private String dimension;
        private String dimensionName;
        private int healthScore;
        private String healthLevel;
        private int achievedCount;
        private int totalMetrics;
    }

    @Data
    public static class ProblemMetric {
        private String metricName;
        private String dimension;
        private double currentValue;
        private double targetValue;
        private String unit;
        private int achievementRate;
        private String severity;
    }

    @Data
    public static class ImprovementAction {
        private String priority;
        private String targetDimension;
        private String targetDimensionName;
        private String description;
        private List<String> recommendedActions;
    }

    @Data
    public static class KpiReportResponse {
        private LocalDate reportDate;
        private int totalKpis;
        private int achievedCount;
        private List<KpiItem> kpiItems;
    }

    @Data
    public static class KpiItem {
        private String metricName;
        private String dimension;
        private double currentValue;
        private double targetValue;
        private String unit;
        private int achievementRate;
        private String status;
    }

    @Data
    public static class MetricTrendResponse {
        private String metricName;
        private LocalDate analysisDate;
        private List<TrendPoint> trendPoints;
    }

    @Data
    public static class TrendPoint {
        private String date;
        private double value;

        public TrendPoint(String date, double value) {
            this.date = date;
            this.value = value;
        }
    }

    // 内部数据类
    @Data
    public static class MetricData {
        private String metricName;
        private String dimension;
        private double currentValue;
        private double targetValue;
        private String unit;

        public MetricData(String metricName, String dimension, double currentValue,
                         double targetValue, String unit) {
            this.metricName = metricName;
            this.dimension = dimension;
            this.currentValue = currentValue;
            this.targetValue = targetValue;
            this.unit = unit;
        }
    }
}
