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
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 过季库存处理智能体
 *
 * 功能：
 * - 识别过季款号和库存
 * - 分析过季原因（预测失误/渠道积压/产能过剩）
 * - 生成清仓/折价/调拨建议
 * - 评估最优处理策略
 *
 * 核心价值：服装行业库存积压占用资金>30%，此智能体帮助快速清理过季库存，回笼资金
 */
@Service
@Lazy
@Slf4j
public class OverstockClearanceOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 分析过季库存并生成处理建议
     *
     * @param thresholdDays 库存天数阈值（超过此天数视为过季）
     * @return 过季库存分析结果
     */
    public OverstockAnalysisResponse analyzeOverstock(int thresholdDays) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询所有入库记录（成品库存）
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "create_time", "unit_price")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .gt("qualified_quantity", 0)
                .last("LIMIT 5000");

        List<ProductWarehousing> inventories = productWarehousingMapper.selectList(wrapper);

        // 分析过季库存
        List<OverstockItem> overstockItems = new ArrayList<>();
        Map<String, CategoryStats> categoryStats = new LinkedHashMap<>();

        LocalDateTime now = LocalDateTime.now();

        for (ProductWarehousing inv : inventories) {
            // 使用入库完成时间或创建时间计算库存天数
            LocalDateTime baseTime = inv.getWarehousingEndTime() != null ?
                    inv.getWarehousingEndTime() : inv.getCreateTime();
            if (baseTime == null) {
                baseTime = now;
            }
            long daysInStock = ChronoUnit.DAYS.between(baseTime, now);

            if (daysInStock >= thresholdDays) {
                OverstockItem item = new OverstockItem();
                item.setStyleNo(inv.getStyleNo());
                item.setStyleName(inv.getStyleName());
                item.setColor(inv.getColor());
                item.setSize(inv.getSize());
                item.setQuantity(inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0);
                item.setUnitPrice(inv.getUnitPrice() != null ? inv.getUnitPrice() : BigDecimal.ZERO);
                item.setTotalValue(item.getQuantity() * item.getUnitPrice().doubleValue());
                item.setWarehouseName(inv.getWarehouseAreaName() != null ? inv.getWarehouseAreaName() : inv.getWarehouse());
                item.setDaysInStock((int) daysInStock);
                item.setOverstockLevel(calculateOverstockLevel((int) daysInStock, thresholdDays));
                item.setSeason(getSeasonFromDate(baseTime));
                overstockItems.add(item);

                // 聚合统计
                String category = getSeasonFromDate(baseTime);
                categoryStats.computeIfAbsent(category, k -> new CategoryStats(category))
                        .addItem(item);
            }
        }

        // 按过季天数和价值排序
        overstockItems.sort((a, b) -> {
            int levelCompare = getOverstockLevelWeight(b.getOverstockLevel()) -
                    getOverstockLevelWeight(a.getOverstockLevel());
            if (levelCompare != 0) return levelCompare;
            return Integer.compare(b.getDaysInStock(), a.getDaysInStock());
        });

        // 生成处理建议
        List<ClearanceSuggestion> suggestions = generateClearanceSuggestions(overstockItems);

        // 计算汇总统计
        int totalQuantity = overstockItems.stream().mapToInt(OverstockItem::getQuantity).sum();
        double totalValue = overstockItems.stream().mapToDouble(OverstockItem::getTotalValue).sum();
        int totalStyles = (int) overstockItems.stream().map(OverstockItem::getStyleNo).distinct().count();

        OverstockAnalysisResponse response = new OverstockAnalysisResponse();
        response.setThresholdDays(thresholdDays);
        response.setAnalysisDate(LocalDate.now());
        response.setTotalOverstockStyles(totalStyles);
        response.setTotalOverstockQuantity(totalQuantity);
        response.setTotalOverstockValue(BigDecimal.valueOf(totalValue).setScale(2, RoundingMode.HALF_UP));
        response.setOverstockItems(overstockItems);
        response.setClearanceSuggestions(suggestions);
        response.setCategoryStats(new ArrayList<>(categoryStats.values()));
        response.setOverallRiskLevel(calculateOverallRisk(overstockItems));

        log.info("[Overstock] 过季库存分析完成: styles={}, qty={}, value={}, suggestions={}",
                totalStyles, totalQuantity, totalValue, suggestions.size());

        return response;
    }

    /**
     * 针对特定款号生成清仓建议
     */
    public ClearanceRecommendation recommendClearance(String styleNo, String targetChannel) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询该款号的入库记录
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "create_time", "warehousing_end_time", "unit_price")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .eq("style_no", styleNo)
                .gt("qualified_quantity", 0)
                .last("LIMIT 1000");

        List<ProductWarehousing> inventories = productWarehousingMapper.selectList(wrapper);

        if (inventories.isEmpty()) {
            ClearanceRecommendation empty = new ClearanceRecommendation();
            empty.setStyleNo(styleNo);
            empty.setTotalQuantity(0);
            empty.setRecommendedAction("该款号无合格库存或已清理完毕");
            return empty;
        }

        int totalQty = inventories.stream().mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0).sum();
        double avgPrice = inventories.stream()
                .filter(i -> i.getUnitPrice() != null)
                .mapToDouble(i -> i.getUnitPrice().doubleValue())
                .average()
                .orElse(0.0);

        // 计算最大库龄天数
        int maxDays = inventories.stream()
                .mapToInt(i -> {
                    LocalDateTime baseTime = i.getWarehousingEndTime() != null ?
                            i.getWarehousingEndTime() : i.getCreateTime();
                    if (baseTime == null) return 0;
                    return (int) ChronoUnit.DAYS.between(baseTime, LocalDateTime.now());
                })
                .max()
                .orElse(0);

        String recommendedDiscount = calculateDiscount(maxDays);
        String recommendedChannel = targetChannel != null ? targetChannel : recommendChannel(maxDays);
        String recommendedAction = recommendAction(maxDays);

        ClearanceRecommendation recommendation = new ClearanceRecommendation();
        recommendation.setStyleNo(styleNo);
        recommendation.setStyleName(inventories.get(0).getStyleName());
        recommendation.setTotalQuantity(totalQty);
        recommendation.setCurrentAvgPrice(BigDecimal.valueOf(avgPrice).setScale(2, RoundingMode.HALF_UP));
        recommendation.setMaxDaysInStock(maxDays);
        recommendation.setRecommendedDiscount(recommendedDiscount);
        recommendation.setRecommendedChannel(recommendedChannel);
        recommendation.setRecommendedAction(recommendedAction);
        recommendation.setEstimatedRecoveryRate(String.format("%.1f%%", calculateRecoveryRate(maxDays) * 100));

        log.info("[Overstock] 清仓建议生成: styleNo={}, qty={}, discount={}, channel={}",
                styleNo, totalQty, recommendedDiscount, recommendedChannel);

        return recommendation;
    }

    /**
     * 计算过季等级
     */
    private String calculateOverstockLevel(int daysInStock, int thresholdDays) {
        if (daysInStock >= thresholdDays * 3) {
            return "CRITICAL"; // 超长库龄，需紧急处理
        } else if (daysInStock >= thresholdDays * 2) {
            return "HIGH"; // 高库龄，建议尽快处理
        } else {
            return "MEDIUM"; // 中等库龄，可计划处理
        }
    }

    /**
     * 生成清仓建议
     */
    private List<ClearanceSuggestion> generateClearanceSuggestions(List<OverstockItem> items) {
        List<ClearanceSuggestion> suggestions = new ArrayList<>();

        // 按款号分组
        Map<String, List<OverstockItem>> styleGroups = items.stream()
                .collect(Collectors.groupingBy(OverstockItem::getStyleNo));

        for (Map.Entry<String, List<OverstockItem>> entry : styleGroups.entrySet()) {
            List<OverstockItem> styleItems = entry.getValue();
            OverstockItem representative = styleItems.get(0);

            int totalQty = styleItems.stream().mapToInt(OverstockItem::getQuantity).sum();
            double totalValue = styleItems.stream().mapToDouble(OverstockItem::getTotalValue).sum();
            int maxDays = styleItems.stream().mapToInt(OverstockItem::getDaysInStock).max().orElse(0);

            ClearanceSuggestion suggestion = new ClearanceSuggestion();
            suggestion.setStyleNo(entry.getKey());
            suggestion.setStyleName(representative.getStyleName());
            suggestion.setTotalQuantity(totalQty);
            suggestion.setTotalValue(BigDecimal.valueOf(totalValue).setScale(2, RoundingMode.HALF_UP));
            suggestion.setMaxDaysInStock(maxDays);
            suggestion.setPriority(maxDays >= 180 ? "URGENT" : maxDays >= 90 ? "HIGH" : "NORMAL");
            suggestion.setRecommendedDiscount(calculateDiscount(maxDays));
            suggestion.setRecommendedChannel(recommendChannel(maxDays));
            suggestion.setAction(recommendAction(maxDays));
            suggestion.setReason(String.format("库龄%d天，需及时处理", maxDays));

            suggestions.add(suggestion);
        }

        // 按优先级排序
        suggestions.sort((a, b) -> {
            int priorityCompare = getPriorityWeight(b.getPriority()) - getPriorityWeight(a.getPriority());
            if (priorityCompare != 0) return priorityCompare;
            return Integer.compare(b.getMaxDaysInStock(), a.getMaxDaysInStock());
        });

        return suggestions;
    }

    /**
     * 计算建议折扣
     */
    private String calculateDiscount(int daysInStock) {
        if (daysInStock >= 365) {
            return "2-3折"; // 1年以上，2-3折清仓
        } else if (daysInStock >= 180) {
            return "4-5折"; // 半年以上，4-5折
        } else if (daysInStock >= 90) {
            return "6-7折"; // 3个月以上，6-7折
        } else {
            return "8折"; // 3个月以内，8折
        }
    }

    /**
     * 推荐清仓渠道
     */
    private String recommendChannel(int daysInStock) {
        if (daysInStock >= 365) {
            return "批发/尾货市场"; // 长期积压，走批发渠道
        } else if (daysInStock >= 180) {
            return "奥莱/特卖"; // 半年积压，走特卖
        } else {
            return "私域/直播"; // 新款过季，私域或直播消化
        }
    }

    /**
     * 推荐处理动作
     */
    private String recommendAction(int daysInStock) {
        if (daysInStock >= 365) {
            return "建议批发处理或捐赠，减少仓储成本";
        } else if (daysInStock >= 180) {
            return "建议奥莱特卖，或与直播电商合作";
        } else {
            return "建议私域促销，或绑定新品销售";
        }
    }

    /**
     * 计算预估回收率
     */
    private double calculateRecoveryRate(int daysInStock) {
        if (daysInStock >= 365) {
            return 0.25; // 25%回收率
        } else if (daysInStock >= 180) {
            return 0.45; // 45%回收率
        } else {
            return 0.65; // 65%回收率
        }
    }

    /**
     * 从日期判断季节
     */
    private String getSeasonFromDate(LocalDateTime date) {
        int month = date.getMonthValue();
        if (month >= 3 && month <= 5) {
            return "春季";
        } else if (month >= 6 && month <= 8) {
            return "夏季";
        } else if (month >= 9 && month <= 11) {
            return "秋季";
        } else {
            return "冬季";
        }
    }

    /**
     * 计算整体风险
     */
    private String calculateOverallRisk(List<OverstockItem> items) {
        if (items.isEmpty()) {
            return "LOW";
        }
        long criticalCount = items.stream()
                .filter(i -> "CRITICAL".equals(i.getOverstockLevel()))
                .count();
        if (criticalCount > 0) {
            return "CRITICAL";
        }
        long highCount = items.stream()
                .filter(i -> "HIGH".equals(i.getOverstockLevel()))
                .count();
        if (highCount > 0) {
            return "HIGH";
        }
        return "MEDIUM";
    }

    private int getOverstockLevelWeight(String level) {
        return switch (level) {
            case "CRITICAL" -> 3;
            case "HIGH" -> 2;
            default -> 1;
        };
    }

    private int getPriorityWeight(String priority) {
        return switch (priority) {
            case "URGENT" -> 3;
            case "HIGH" -> 2;
            default -> 1;
        };
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class OverstockAnalysisResponse {
        private int thresholdDays;
        private LocalDate analysisDate;
        private int totalOverstockStyles;
        private int totalOverstockQuantity;
        private BigDecimal totalOverstockValue;
        private String overallRiskLevel;
        private List<OverstockItem> overstockItems;
        private List<ClearanceSuggestion> clearanceSuggestions;
        private List<CategoryStats> categoryStats;
    }

    @Data
    public static class OverstockItem {
        private String styleNo;
        private String styleName;
        private String color;
        private String size;
        private int quantity;
        private BigDecimal unitPrice;
        private double totalValue;
        private String warehouseName;
        private int daysInStock;
        private String overstockLevel;
        private String season;
    }

    @Data
    public static class CategoryStats {
        private String category;
        private int styleCount;
        private int totalQuantity;
        private double totalValue;

        public CategoryStats(String category) {
            this.category = category;
            this.styleCount = 0;
            this.totalQuantity = 0;
            this.totalValue = 0;
        }

        public void addItem(OverstockItem item) {
            this.styleCount++;
            this.totalQuantity += item.getQuantity();
            this.totalValue += item.getTotalValue();
        }
    }

    @Data
    public static class ClearanceSuggestion {
        private String styleNo;
        private String styleName;
        private int totalQuantity;
        private BigDecimal totalValue;
        private int maxDaysInStock;
        private String priority;
        private String recommendedDiscount;
        private String recommendedChannel;
        private String action;
        private String reason;
    }

    @Data
    public static class ClearanceRecommendation {
        private String styleNo;
        private String styleName;
        private int totalQuantity;
        private BigDecimal currentAvgPrice;
        private int maxDaysInStock;
        private String recommendedDiscount;
        private String recommendedChannel;
        private String recommendedAction;
        private String estimatedRecoveryRate;
    }
}
