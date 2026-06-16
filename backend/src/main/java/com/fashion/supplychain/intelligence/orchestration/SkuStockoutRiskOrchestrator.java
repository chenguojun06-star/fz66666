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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * SKU断货风险评分智能体
 *
 * 功能：
 * - 评估各SKU的断货风险
 * - 预测断货时间点
 * - 提供补货建议
 * - 生成风险预警报告
 *
 * 核心价值：提前预警断货风险，减少缺货损失
 */
@Service
@Lazy
@Slf4j
public class SkuStockoutRiskOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 获取SKU断货风险评分报告
     */
    public StockoutRiskResponse analyzeStockoutRisk(List<String> styleNos) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<SkuRiskItem> riskItems = new ArrayList<>();

        for (String styleNo : styleNos) {
            try {
                SkuRiskItem risk = analyzeStyleRisk(tenantId, styleNo);
                riskItems.add(risk);
            } catch (Exception e) {
                log.warn("[StockoutRisk] 分析失败: styleNo={}, error={}", styleNo, e.getMessage());
            }
        }

        // 按风险评分排序
        riskItems.sort((a, b) -> Integer.compare(b.getRiskScore(), a.getRiskScore()));

        // 统计各风险等级数量
        long highRisk = riskItems.stream().filter(r -> "HIGH".equals(r.getRiskLevel())).count();
        long mediumRisk = riskItems.stream().filter(r -> "MEDIUM".equals(r.getRiskLevel())).count();
        long lowRisk = riskItems.stream().filter(r -> "LOW".equals(r.getRiskLevel())).count();

        StockoutRiskResponse response = new StockoutRiskResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalSkus(riskItems.size());
        response.setHighRiskCount((int) highRisk);
        response.setMediumRiskCount((int) mediumRisk);
        response.setLowRiskCount((int) lowRisk);
        response.setRiskItems(riskItems);

        log.info("[StockoutRisk] 断货风险分析完成: total={}, high={}, medium={}, low={}",
                riskItems.size(), highRisk, mediumRisk, lowRisk);

        return response;
    }

    /**
     * 获取高风险SKU列表
     */
    public HighRiskSkuResponse getHighRiskSkus(int riskThreshold, int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询所有库存
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .gt("qualified_quantity", 0)
                .last("LIMIT 5000");

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        // 按SKU分组
        Map<String, List<ProductWarehousing>> skuGroups = inventory.stream()
                .collect(Collectors.groupingBy(this::makeSkuKey));

        List<HighRiskSku> highRiskSkus = new ArrayList<>();

        for (Map.Entry<String, List<ProductWarehousing>> entry : skuGroups.entrySet()) {
            int riskScore = calculateRiskScore(entry.getValue());
            if (riskScore >= riskThreshold) {
                HighRiskSku sku = new HighRiskSku();
                sku.setSku(entry.getKey());

                ProductWarehousing first = entry.getValue().get(0);
                sku.setStyleNo(first.getStyleNo());
                sku.setStyleName(first.getStyleName());
                sku.setColor(first.getColor());
                sku.setSize(first.getSize());

                sku.setTotalQuantity(entry.getValue().stream()
                        .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                        .sum());

                sku.setRiskScore(riskScore);
                sku.setRiskLevel(riskScore >= 80 ? "CRITICAL" : riskScore >= 60 ? "HIGH" : "MEDIUM");
                sku.setEstimatedDaysUntilStockout(calculateDaysUntilStockout(entry.getValue()));
                sku.setRecommendedAction(getRecommendedAction(riskScore));

                highRiskSkus.add(sku);
            }
        }

        // 排序并限制
        highRiskSkus.sort((a, b) -> Integer.compare(b.getRiskScore(), a.getRiskScore()));
        if (highRiskSkus.size() > limit) {
            highRiskSkus = highRiskSkus.subList(0, limit);
        }

        HighRiskSkuResponse response = new HighRiskSkuResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setRiskThreshold(riskThreshold);
        response.setTotalHighRisk(highRiskSkus.size());
        response.setHighRiskSkus(highRiskSkus);

        return response;
    }

    /**
     * 获取补货建议
     */
    public ReplenishmentSuggestionResponse getReplenishmentSuggestions(List<String> styleNos) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();

        for (String styleNo : styleNos) {
            ReplenishmentSuggestion suggestion = generateReplenishmentSuggestion(tenantId, styleNo);
            if (suggestion.getSuggestedQty() > 0) {
                suggestions.add(suggestion);
            }
        }

        // 按优先级排序
        suggestions.sort((a, b) -> {
            int levelCompare = getPriorityOrder(b.getPriority()) - getPriorityOrder(a.getPriority());
            return levelCompare != 0 ? levelCompare : Integer.compare(b.getSuggestedQty(), a.getSuggestedQty());
        });

        ReplenishmentSuggestionResponse response = new ReplenishmentSuggestionResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalSuggestions(suggestions.size());
        response.setSuggestions(suggestions);

        return response;
    }

    /**
     * 分析单个款号的风险
     */
    private SkuRiskItem analyzeStyleRisk(Long tenantId, String styleNo) {
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .eq("style_no", styleNo)
                .gt("qualified_quantity", 0);

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        if (inventory.isEmpty()) {
            SkuRiskItem item = new SkuRiskItem();
            item.setStyleNo(styleNo);
            item.setRiskScore(0);
            item.setRiskLevel("NO_STOCK");
            item.setNote("当前无库存");
            return item;
        }

        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();

        int riskScore = calculateRiskScore(inventory);
        String riskLevel = classifyRiskLevel(riskScore);

        SkuRiskItem item = new SkuRiskItem();
        item.setStyleNo(styleNo);
        item.setStyleName(inventory.get(0).getStyleName());
        item.setTotalQuantity(totalQty);
        item.setRiskScore(riskScore);
        item.setRiskLevel(riskLevel);
        item.setEstimatedDaysUntilStockout(calculateDaysUntilStockout(inventory));
        item.setRecommendedAction(getRecommendedAction(riskScore));

        return item;
    }

    /**
     * 计算风险评分
     */
    private int calculateRiskScore(List<ProductWarehousing> inventory) {
        int score = 0;

        // 库存数量评分
        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();

        if (totalQty == 0) {
            return 100; // 无库存，最高风险
        } else if (totalQty < 10) {
            score += 40;
        } else if (totalQty < 30) {
            score += 25;
        } else if (totalQty < 50) {
            score += 10;
        }

        // 库存年龄评分
        LocalDateTime now = LocalDateTime.now();
        for (ProductWarehousing inv : inventory) {
            if (inv.getCreateTime() != null) {
                long days = ChronoUnit.DAYS.between(inv.getCreateTime(), now);
                if (days > 90) {
                    score += 20;
                } else if (days > 60) {
                    score += 10;
                }
            }
        }

        // SKU数量评分（尺码/颜色越多风险越高）
        int skuCount = (int) inventory.stream()
                .map(i -> i.getColor() + "|" + i.getSize())
                .distinct()
                .count();
        if (skuCount > 10) {
            score += 15;
        } else if (skuCount > 5) {
            score += 5;
        }

        // 销量趋势评分（简化：根据库存年龄估算）
        double avgDaysInStock = inventory.stream()
                .filter(i -> i.getCreateTime() != null)
                .mapToDouble(i -> ChronoUnit.DAYS.between(i.getCreateTime(), now))
                .average()
                .orElse(30);
        if (avgDaysInStock < 15) {
            score += 25; // 库存周转快，断货风险高
        } else if (avgDaysInStock < 30) {
            score += 15;
        }

        return Math.min(score, 100);
    }

    /**
     * 估算断货天数
     */
    private int calculateDaysUntilStockout(List<ProductWarehousing> inventory) {
        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();

        LocalDateTime now = LocalDateTime.now();
        double avgDaysInStock = inventory.stream()
                .filter(i -> i.getCreateTime() != null)
                .mapToDouble(i -> ChronoUnit.DAYS.between(i.getCreateTime(), now))
                .average()
                .orElse(30);

        if (avgDaysInStock <= 0) {
            return 999;
        }

        // 估算日销量
        double dailySales = totalQty / avgDaysInStock;
        if (dailySales <= 0) {
            return 999;
        }

        return (int) Math.round(totalQty / dailySales);
    }

    /**
     * 分类风险等级
     */
    private String classifyRiskLevel(int score) {
        if (score >= 80) return "HIGH";
        if (score >= 50) return "MEDIUM";
        return "LOW";
    }

    /**
     * 获取推荐行动
     */
    private String getRecommendedAction(int riskScore) {
        if (riskScore >= 80) return "立即补货";
        if (riskScore >= 50) return "近期补货";
        return "库存充足";
    }

    /**
     * 生成补货建议
     */
    private ReplenishmentSuggestion generateReplenishmentSuggestion(Long tenantId, String styleNo) {
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "qualified_quantity", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .eq("style_no", styleNo);

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        ReplenishmentSuggestion suggestion = new ReplenishmentSuggestion();
        suggestion.setStyleNo(styleNo);

        if (inventory.isEmpty()) {
            suggestion.setPriority("URGENT");
            suggestion.setSuggestedQty(100);
            suggestion.setReason("当前无库存");
            return suggestion;
        }

        suggestion.setStyleName(inventory.get(0).getStyleName());

        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();

        int riskScore = calculateRiskScore(inventory);

        if (riskScore >= 80) {
            suggestion.setPriority("URGENT");
            suggestion.setSuggestedQty(Math.max(100, 2 * totalQty));
            suggestion.setReason("高断货风险");
        } else if (riskScore >= 50) {
            suggestion.setPriority("HIGH");
            suggestion.setSuggestedQty(Math.max(50, totalQty));
            suggestion.setReason("中等断货风险");
        } else {
            suggestion.setPriority("NORMAL");
            suggestion.setSuggestedQty(0);
            suggestion.setReason("库存充足");
        }

        return suggestion;
    }

    private int getPriorityOrder(String priority) {
        return "URGENT".equals(priority) ? 3 : "HIGH".equals(priority) ? 2 : 1;
    }

    private String makeSkuKey(ProductWarehousing inv) {
        return (inv.getStyleNo() != null ? inv.getStyleNo() : "") + "|" +
                (inv.getColor() != null ? inv.getColor() : "") + "|" +
                (inv.getSize() != null ? inv.getSize() : "");
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class StockoutRiskResponse {
        private LocalDate analysisDate;
        private int totalSkus;
        private int highRiskCount;
        private int mediumRiskCount;
        private int lowRiskCount;
        private List<SkuRiskItem> riskItems;
    }

    @Data
    public static class SkuRiskItem {
        private String styleNo;
        private String styleName;
        private int totalQuantity;
        private int riskScore;
        private String riskLevel;
        private int estimatedDaysUntilStockout;
        private String recommendedAction;
        private String note;
    }

    @Data
    public static class HighRiskSkuResponse {
        private LocalDate analysisDate;
        private int riskThreshold;
        private int totalHighRisk;
        private List<HighRiskSku> highRiskSkus;
    }

    @Data
    public static class HighRiskSku {
        private String sku;
        private String styleNo;
        private String styleName;
        private String color;
        private String size;
        private int totalQuantity;
        private int riskScore;
        private String riskLevel;
        private int estimatedDaysUntilStockout;
        private String recommendedAction;
    }

    @Data
    public static class ReplenishmentSuggestionResponse {
        private LocalDate analysisDate;
        private int totalSuggestions;
        private List<ReplenishmentSuggestion> suggestions;
    }

    @Data
    public static class ReplenishmentSuggestion {
        private String styleNo;
        private String styleName;
        private String priority;
        private int suggestedQty;
        private String reason;
    }
}
