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
 * 多仓库存平衡智能体
 *
 * 功能：
 * - 分析各仓库的库存分布
 * - 识别库存不平衡的SKU
 * - 生成跨仓库调拨建议
 * - 优化整体库存水平
 *
 * 核心价值：减少库存积压，提高库存周转率
 */
@Service
@Lazy
@Slf4j
public class MultiWarehouseBalanceOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 分析多仓库存平衡状况
     */
    public WarehouseBalanceResponse analyzeBalance() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询所有仓库的库存
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "warehouse_area_id", "create_time")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .gt("qualified_quantity", 0)
                .orderByAsc("warehouse", "style_no", "color", "size")
                .last("LIMIT 10000");

        List<ProductWarehousing> allInventory = productWarehousingMapper.selectList(wrapper);

        // 按仓库分组
        Map<String, List<ProductWarehousing>> inventoryByWarehouse = allInventory.stream()
                .collect(Collectors.groupingBy(inv -> {
                    String key = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() :
                            (inv.getWarehouse() != null ? inv.getWarehouse() : "DEFAULT");
                    return key;
                }));

        // 获取所有SKU
        Set<String> allSkus = allInventory.stream()
                .map(this::makeSkuKey)
                .collect(Collectors.toSet());

        // 分析每个SKU在各仓库的分布
        List<SkuBalanceAnalysis> skuAnalysisList = new ArrayList<>();
        List<WarehouseBalance> warehouseBalances = new ArrayList<>();

        for (String sku : allSkus) {
            SkuBalanceAnalysis analysis = analyzeSkuBalance(sku, allInventory, inventoryByWarehouse.keySet());
            skuAnalysisList.add(analysis);
        }

        // 计算各仓库的库存统计
        for (String warehouse : inventoryByWarehouse.keySet()) {
            List<ProductWarehousing> warehouseInventory = inventoryByWarehouse.get(warehouse);
            WarehouseBalance balance = calculateWarehouseBalance(warehouse, warehouseInventory);
            warehouseBalances.add(balance);
        }

        // 生成调拨建议
        List<TransferSuggestion> suggestions = generateTransferSuggestions(skuAnalysisList, warehouseBalances);

        WarehouseBalanceResponse response = new WarehouseBalanceResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalWarehouses(warehouseBalances.size());
        response.setTotalSkus(allSkus.size());
        response.setWarehouseBalances(warehouseBalances);
        response.setSkuBalanceAnalysis(skuAnalysisList);
        response.setTransferSuggestions(suggestions);

        log.info("[MultiWarehouseBalance] 多仓库存平衡分析完成: warehouses={}, skus={}, suggestions={}",
                warehouseBalances.size(), allSkus.size(), suggestions.size());

        return response;
    }

    /**
     * 为特定SKU生成调拨建议
     */
    public SkuTransferSuggestion suggestTransferForSku(String styleNo, String color, String size) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        String skuKey = makeSkuKey(styleNo, color, size);

        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "warehouse_area_id")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .eq("style_no", styleNo)
                .eq("color", color)
                .eq("size", size)
                .gt("qualified_quantity", 0);

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        if (inventory.size() < 2) {
            SkuTransferSuggestion empty = new SkuTransferSuggestion();
            empty.setSku(skuKey);
            empty.setMessage("该SKU仅存在于一个仓库，无需调拨");
            return empty;
        }

        // 找出库存过多和库存不足的仓库
        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();
        int avgQty = totalQty / inventory.size();

        List<WarehouseStock> overstocked = new ArrayList<>();
        List<WarehouseStock> understocked = new ArrayList<>();

        for (ProductWarehousing inv : inventory) {
            int qty = inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0;
            String warehouse = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() : inv.getWarehouse();

            if (qty > avgQty * 1.3) {
                overstocked.add(new WarehouseStock(warehouse, inv.getWarehouseAreaName(), qty, qty - avgQty));
            } else if (qty < avgQty * 0.7) {
                understocked.add(new WarehouseStock(warehouse, inv.getWarehouseAreaName(), qty, avgQty - qty));
            }
        }

        // 生成调拨方案
        List<TransferPlan> plans = new ArrayList<>();
        for (WarehouseStock over : overstocked) {
            for (WarehouseStock under : understocked) {
                int transferQty = Math.min(over.getExcess(), under.getNeed());
                if (transferQty > 0) {
                    TransferPlan plan = new TransferPlan();
                    plan.setFromWarehouse(over.getWarehouseId());
                    plan.setFromWarehouseName(over.getWarehouseName());
                    plan.setToWarehouse(under.getWarehouseId());
                    plan.setToWarehouseName(under.getWarehouseName());
                    plan.setQuantity(transferQty);
                    plan.setReason(String.format("平衡库存：%s库存%s，%s库存不足",
                            over.getWarehouseName(), over.getExcess() > 0 ? "过剩" : "不足",
                            under.getWarehouseName()));
                    plans.add(plan);
                }
            }
        }

        SkuTransferSuggestion suggestion = new SkuTransferSuggestion();
        suggestion.setSku(skuKey);
        suggestion.setStyleNo(styleNo);
        suggestion.setColor(color);
        suggestion.setSize(size);
        suggestion.setTotalQuantity(totalQty);
        suggestion.setAveragePerWarehouse(avgQty);
        suggestion.setTransferPlans(plans);

        log.info("[MultiWarehouseBalance] SKU调拨建议生成: sku={}, plans={}", skuKey, plans.size());

        return suggestion;
    }

    /**
     * 分析单个SKU的库存平衡
     */
    private SkuBalanceAnalysis analyzeSkuBalance(String sku, List<ProductWarehousing> allInventory,
                                                  Set<String> warehouses) {
        SkuBalanceAnalysis analysis = new SkuBalanceAnalysis();
        analysis.setSku(sku);

        Map<String, Integer> warehouseStock = new HashMap<>();
        int totalQty = 0;

        for (ProductWarehousing inv : allInventory) {
            if (makeSkuKey(inv).equals(sku)) {
                String warehouse = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() :
                        (inv.getWarehouse() != null ? inv.getWarehouse() : "DEFAULT");
                int qty = inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0;
                warehouseStock.put(warehouse, qty);
                totalQty += qty;
            }
        }

        analysis.setWarehouseStock(warehouseStock);
        analysis.setTotalQuantity(totalQty);

        // 计算平衡性评分
        if (warehouseStock.size() > 1) {
            double avg = warehouseStock.values().stream()
                    .mapToInt(Integer::intValue)
                    .average()
                    .orElse(1);

            double variance = warehouseStock.values().stream()
                    .mapToDouble(v -> Math.pow(v - avg, 2))
                    .average()
                    .orElse(0);

            double balanceScore = Math.max(0, 100 - Math.sqrt(variance) / avg * 100);
            analysis.setBalanceScore((int) Math.round(balanceScore));
            analysis.setBalanceLevel(balanceScore >= 80 ? "BALANCED" : balanceScore >= 60 ? "MODERATE" : "UNBALANCED");
        } else {
            analysis.setBalanceScore(100);
            analysis.setBalanceLevel("SINGLE_WAREHOUSE");
        }

        return analysis;
    }

    /**
     * 计算仓库库存平衡
     */
    private WarehouseBalance calculateWarehouseBalance(String warehouse, List<ProductWarehousing> inventory) {
        WarehouseBalance balance = new WarehouseBalance();
        balance.setWarehouseId(warehouse);
        balance.setWarehouseName(inventory.isEmpty() ? warehouse :
                (inventory.get(0).getWarehouseAreaName() != null ? inventory.get(0).getWarehouseAreaName() : warehouse));

        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();
        balance.setTotalQuantity(totalQty);
        balance.setSkuCount((int) inventory.stream().map(this::makeSkuKey).distinct().count());

        // 计算库存周转率（简化：基于入库时间）
        LocalDateTime now = LocalDateTime.now();
        double avgDaysInStock = inventory.stream()
                .filter(i -> i.getCreateTime() != null)
                .mapToDouble(i -> java.time.temporal.ChronoUnit.DAYS.between(i.getCreateTime(), now))
                .average()
                .orElse(30);
        balance.setAverageDaysInStock((int) Math.round(avgDaysInStock));

        // 健康度评分
        int healthScore = avgDaysInStock <= 30 ? 100 : avgDaysInStock <= 60 ? 80 : avgDaysInStock <= 90 ? 60 : 40;
        balance.setHealthScore(healthScore);
        balance.setHealthLevel(healthScore >= 80 ? "HEALTHY" : healthScore >= 60 ? "WARNING" : "CRITICAL");

        return balance;
    }

    /**
     * 生成调拨建议
     */
    private List<TransferSuggestion> generateTransferSuggestions(List<SkuBalanceAnalysis> skuAnalysisList,
                                                                 List<WarehouseBalance> warehouseBalances) {
        List<TransferSuggestion> suggestions = new ArrayList<>();

        // 找出库存健康度低的仓库
        List<WarehouseBalance> unhealthyWarehouses = warehouseBalances.stream()
                .filter(w -> "CRITICAL".equals(w.getHealthLevel()))
                .collect(Collectors.toList());

        // 找出库存健康度高的仓库
        List<WarehouseBalance> healthyWarehouses = warehouseBalances.stream()
                .filter(w -> "HEALTHY".equals(w.getHealthLevel()))
                .collect(Collectors.toList());

        // 为不平衡的SKU生成调拨建议
        for (SkuBalanceAnalysis skuAnalysis : skuAnalysisList) {
            if ("UNBALANCED".equals(skuAnalysis.getBalanceLevel())) {
                TransferSuggestion suggestion = new TransferSuggestion();
                suggestion.setSku(skuAnalysis.getSku());
                suggestion.setPriority("HIGH");
                suggestion.setReason("SKU库存分布严重不平衡");
                suggestion.setAction("建议在仓库间调拨平衡库存");
                suggestion.setEstimatedBenefit("预计降低库存周转天数10-20天");
                suggestions.add(suggestion);
            }
        }

        // 限制返回数量
        if (suggestions.size() > 50) {
            suggestions = suggestions.subList(0, 50);
        }

        return suggestions;
    }

    private String makeSkuKey(ProductWarehousing inv) {
        return (inv.getStyleNo() != null ? inv.getStyleNo() : "") + "|" +
                (inv.getColor() != null ? inv.getColor() : "") + "|" +
                (inv.getSize() != null ? inv.getSize() : "");
    }

    private String makeSkuKey(String styleNo, String color, String size) {
        return (styleNo != null ? styleNo : "") + "|" +
                (color != null ? color : "") + "|" +
                (size != null ? size : "");
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class WarehouseBalanceResponse {
        private LocalDate analysisDate;
        private int totalWarehouses;
        private int totalSkus;
        private List<WarehouseBalance> warehouseBalances;
        private List<SkuBalanceAnalysis> skuBalanceAnalysis;
        private List<TransferSuggestion> transferSuggestions;
    }

    @Data
    public static class WarehouseBalance {
        private String warehouseId;
        private String warehouseName;
        private int totalQuantity;
        private int skuCount;
        private int averageDaysInStock;
        private int healthScore;
        private String healthLevel;
    }

    @Data
    public static class SkuBalanceAnalysis {
        private String sku;
        private Map<String, Integer> warehouseStock;
        private int totalQuantity;
        private int balanceScore;
        private String balanceLevel;
    }

    @Data
    public static class TransferSuggestion {
        private String sku;
        private String priority;
        private String reason;
        private String action;
        private String estimatedBenefit;
    }

    @Data
    public static class SkuTransferSuggestion {
        private String sku;
        private String styleNo;
        private String color;
        private String size;
        private int totalQuantity;
        private int averagePerWarehouse;
        private List<TransferPlan> transferPlans;
        private String message;
    }

    @Data
    public static class TransferPlan {
        private String fromWarehouse;
        private String fromWarehouseName;
        private String toWarehouse;
        private String toWarehouseName;
        private int quantity;
        private String reason;
    }

    @Data
    public static class WarehouseStock {
        private String warehouseId;
        private String warehouseName;
        private int quantity;
        private int excess; // 正数表示过剩
        private int need;   // 正数表示需要补充的数量

        public WarehouseStock(String warehouseId, String warehouseName, int quantity, int excess) {
            this.warehouseId = warehouseId;
            this.warehouseName = warehouseName;
            this.quantity = quantity;
            this.excess = excess;
            this.need = Math.max(0, -excess); // 如果 excess 是负数，need 就是它的绝对值
        }
    }
}
