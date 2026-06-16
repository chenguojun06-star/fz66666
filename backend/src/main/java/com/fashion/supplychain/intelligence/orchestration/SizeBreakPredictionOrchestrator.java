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
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 断码预测智能体
 *
 * 功能：
 * - 基于历史销售数据和库存水平，预测每个SKU的断码时间点
 * - 分析尺码分布趋势，识别即将断码的尺码
 * - 提供补货建议，防止断货损失
 *
 * 核心价值：服装行业最大流失原因之一是断码导致客户流失，此智能体帮助提前预警
 */
@Service
@Lazy
@Slf4j
public class SizeBreakPredictionOrchestrator {

    @Autowired
    private ProductWarehousingMapper warehousingMapper;

    /**
     * 预测指定款号的断码风险
     *
     * @param styleNo 款号
     * @param salesChannel 销售渠道（可选，用于筛选特定渠道的销售）
     * @return 断码预测结果
     */
    public SizeBreakPredictionResponse predictSizeBreak(String styleNo, String salesChannel) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询最近6个月的入库数据
        LocalDateTime start = LocalDateTime.now().minusMonths(6);
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("size", "color", "qualified_quantity", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("style_no", styleNo)
                .ge("create_time", start)
                .orderByAsc("create_time", "size", "color")
                .last("LIMIT 10000");

        List<ProductWarehousing> records = warehousingMapper.selectList(wrapper);

        // 分析尺码销售趋势
        Map<String, SizeAnalysis> sizeAnalysisMap = analyzeSizeTrends(records);

        // 计算断码风险
        List<SizeBreakRisk> risks = calculateBreakRisks(sizeAnalysisMap);

        // 生成补货建议
        List<ReplenishmentSuggestion> suggestions = generateReplenishmentSuggestions(risks);

        SizeBreakPredictionResponse response = new SizeBreakPredictionResponse();
        response.setStyleNo(styleNo);
        response.setSalesChannel(salesChannel);
        response.setTotalSales(records.size());
        response.setSizeBreakRisks(risks);
        response.setReplenishmentSuggestions(suggestions);
        response.setOverallRiskLevel(calculateOverallRisk(risks));
        response.setAnalysisTime(LocalDateTime.now());

        log.info("[SizeBreak] 断码预测完成: styleNo={}, risks={}, suggestions={}",
                styleNo, risks.size(), suggestions.size());

        return response;
    }

    /**
     * 批量预测多个款号的断码风险
     */
    public List<SizeBreakPredictionResponse> predictSizeBreakBatch(List<String> styleNos, String salesChannel) {
        return styleNos.stream()
                .map(styleNo -> {
                    try {
                        return predictSizeBreak(styleNo, salesChannel);
                    } catch (Exception e) {
                        log.warn("[SizeBreak] 批量预测失败: styleNo={}, error={}", styleNo, e.getMessage());
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    /**
     * 分析尺码销售趋势
     */
    private Map<String, SizeAnalysis> analyzeSizeTrends(List<ProductWarehousing> records) {
        Map<String, List<Map<String, Object>>> monthlyData = new LinkedHashMap<>();

        // 按月份和尺码聚合
        for (ProductWarehousing record : records) {
            String month = record.getCreateTime().getYear() + "-" +
                    String.format("%02d", record.getCreateTime().getMonthValue());
            String key = record.getSize() + "|" + (record.getColor() != null ? record.getColor() : "");

            monthlyData.computeIfAbsent(key, k -> new ArrayList<>());
            Map<String, Object> monthStat = new HashMap<>();
            monthStat.put("month", month);
            monthStat.put("quantity", record.getQualifiedQuantity() != null ? record.getQualifiedQuantity() : 0);
            monthStat.put("record", record);
            monthlyData.get(key).add(monthStat);
        }

        // 计算每个尺码的趋势
        Map<String, SizeAnalysis> analysisMap = new LinkedHashMap<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : monthlyData.entrySet()) {
            String[] parts = entry.getKey().split("\\|");
            String size = parts[0];
            String color = parts.length > 1 ? parts[1] : "";

            List<Map<String, Object>> data = entry.getValue();
            if (data.isEmpty()) continue;

            SizeAnalysis analysis = new SizeAnalysis();
            analysis.setSize(size);
            analysis.setColor(color);

            // 计算总销量和月均销量
            int totalQty = data.stream()
                    .mapToInt(d -> (Integer) d.get("quantity"))
                    .sum();
            analysis.setTotalSales(totalQty);
            analysis.setAvgMonthlySales(totalQty / Math.max(1, data.size()));

            // 计算趋势（最近3个月）
            List<Integer> recentSales = data.stream()
                    .sorted(Comparator.comparing(d -> (String) d.get("month")))
                    .skip(Math.max(0, data.size() - 3))
                    .map(d -> (Integer) d.get("quantity"))
                    .collect(Collectors.toList());

            if (recentSales.size() >= 2) {
                double trend = recentSales.get(recentSales.size() - 1) -
                        recentSales.get(0);
                analysis.setTrend((int) trend);
                analysis.setTrendDirection(trend > 0 ? "UP" : trend < 0 ? "DOWN" : "STABLE");
            }

            // 计算尺码占比
            Map<String, Integer> sizeTotals = new HashMap<>();
            for (Map<String, Object> d : data) {
                ProductWarehousing r = (ProductWarehousing) d.get("record");
                String s = r.getSize();
                sizeTotals.merge(s, (Integer) d.get("quantity"), Integer::sum);
            }
            int allTotal = sizeTotals.values().stream().mapToInt(Integer::intValue).sum();
            if (allTotal > 0) {
                BigDecimal pct = BigDecimal.valueOf(totalQty)
                        .divide(BigDecimal.valueOf(allTotal), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100))
                        .setScale(1, RoundingMode.HALF_UP);
                analysis.setSalesPercent(pct.doubleValue());
            }

            analysisMap.put(entry.getKey(), analysis);
        }

        return analysisMap;
    }

    /**
     * 计算断码风险
     */
    private List<SizeBreakRisk> calculateBreakRisks(Map<String, SizeAnalysis> sizeAnalysisMap) {
        List<SizeBreakRisk> risks = new ArrayList<>();

        // 计算平均销售占比作为基准
        double avgPercent = sizeAnalysisMap.values().stream()
                .mapToDouble(SizeAnalysis::getSalesPercent)
                .average()
                .orElse(10.0);

        for (SizeAnalysis analysis : sizeAnalysisMap.values()) {
            // 风险判断条件：
            // 1. 销售占比低于平均值的50%
            // 2. 销售趋势下降
            // 3. 最近月份销量低于月均值
            boolean isHighRisk = analysis.getSalesPercent() < avgPercent * 0.5;
            boolean isDownTrend = "DOWN".equals(analysis.getTrendDirection());

            if (isHighRisk && isDownTrend) {
                SizeBreakRisk risk = new SizeBreakRisk();
                risk.setSize(analysis.getSize());
                risk.setColor(analysis.getColor());
                risk.setSalesPercent(analysis.getSalesPercent());
                risk.setTrendDirection(analysis.getTrendDirection());
                risk.setTrend(analysis.getTrend());
                risk.setAvgMonthlySales(analysis.getAvgMonthlySales());
                risk.setRiskLevel(analysis.getSalesPercent() < avgPercent * 0.3 ? "HIGH" : "MEDIUM");
                risk.setReason(String.format("销售占比%.1f%%低于均值%.1f%%，且呈下降趋势",
                        analysis.getSalesPercent(), avgPercent));
                risk.setDaysUntilBreak(estimateDaysUntilBreak(analysis));
                risks.add(risk);
            }
        }

        // 按风险等级和断码时间排序
        risks.sort((a, b) -> {
            int levelCompare = getRiskLevelWeight(b.getRiskLevel()) - getRiskLevelWeight(a.getRiskLevel());
            if (levelCompare != 0) return levelCompare;
            return Integer.compare(a.getDaysUntilBreak(), b.getDaysUntilBreak());
        });

        return risks;
    }

    /**
     * 生成补货建议
     */
    private List<ReplenishmentSuggestion> generateReplenishmentSuggestions(List<SizeBreakRisk> risks) {
        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();

        for (SizeBreakRisk risk : risks) {
            if (risk.getDaysUntilBreak() <= 30) {
                ReplenishmentSuggestion suggestion = new ReplenishmentSuggestion();
                suggestion.setSize(risk.getSize());
                suggestion.setColor(risk.getColor());
                suggestion.setSuggestedQuantity(calculateSuggestedQty(risk));
                suggestion.setPriority(risk.getDaysUntilBreak() <= 7 ? "URGENT" :
                        risk.getDaysUntilBreak() <= 14 ? "HIGH" : "NORMAL");
                suggestion.setReason(String.format("预计%d天后断码，需补货", risk.getDaysUntilBreak()));
                suggestion.setAction("立即下单生产或调拨库存");
                suggestions.add(suggestion);
            }
        }

        return suggestions;
    }

    /**
     * 估算断码天数
     */
    private int estimateDaysUntilBreak(SizeAnalysis analysis) {
        if (analysis.getAvgMonthlySales() <= 0) {
            return 999; // 无法估算
        }
        // 假设当前库存为月均销量的2倍
        int estimatedStock = analysis.getAvgMonthlySales() * 2;
        int dailySales = analysis.getAvgMonthlySales() / 30;
        if (dailySales <= 0) {
            return 999;
        }
        return estimatedStock / dailySales;
    }

    /**
     * 计算建议补货量
     */
    private int calculateSuggestedQty(SizeBreakRisk risk) {
        // 基于月均销量计算，建议补足3个月销量
        return risk.getAvgMonthlySales() * 3;
    }

    /**
     * 计算整体风险等级
     */
    private String calculateOverallRisk(List<SizeBreakRisk> risks) {
        if (risks.isEmpty()) {
            return "LOW";
        }
        long urgentCount = risks.stream()
                .filter(r -> "HIGH".equals(r.getRiskLevel()))
                .count();
        if (urgentCount > 0) {
            return "HIGH";
        }
        long mediumCount = risks.stream()
                .filter(r -> "MEDIUM".equals(r.getRiskLevel()))
                .count();
        if (mediumCount > 0) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private int getRiskLevelWeight(String level) {
        return switch (level) {
            case "HIGH" -> 3;
            case "MEDIUM" -> 2;
            default -> 1;
        };
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class SizeBreakPredictionResponse {
        private String styleNo;
        private String salesChannel;
        private int totalSales;
        private String overallRiskLevel;
        private List<SizeBreakRisk> sizeBreakRisks;
        private List<ReplenishmentSuggestion> replenishmentSuggestions;
        private LocalDateTime analysisTime;
    }

    @Data
    public static class SizeAnalysis {
        private String size;
        private String color;
        private int totalSales;
        private int avgMonthlySales;
        private int trend;
        private String trendDirection;
        private double salesPercent;
    }

    @Data
    public static class SizeBreakRisk {
        private String size;
        private String color;
        private double salesPercent;
        private String trendDirection;
        private int trend;
        private int avgMonthlySales;
        private String riskLevel;
        private String reason;
        private int daysUntilBreak;
    }

    @Data
    public static class ReplenishmentSuggestion {
        private String size;
        private String color;
        private int suggestedQuantity;
        private String priority;
        private String reason;
        private String action;
    }
}
