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
import java.util.*;
import java.util.stream.Collectors;

/**
 * 智能调拨优化智能体
 *
 * 功能：
 * - 分析库存分布，识别调拨需求
 * - 优化调拨路径，降低运输成本
 * - 生成最优调拨方案
 * - 评估调拨效果
 *
 * 核心价值：优化库存配置，降低物流成本
 */
@Service
@Lazy
@Slf4j
public class InventoryTransferOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 生成智能调拨方案
     */
    public TransferPlanResponse generateTransferPlan(String styleNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询指定款号的库存分布
        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "warehouse_area_id")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .eq("style_no", styleNo)
                .gt("qualified_quantity", 0);

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        if (inventory.size() < 2) {
            TransferPlanResponse empty = new TransferPlanResponse();
            empty.setStyleNo(styleNo);
            empty.setMessage("该款号库存仅存在于一个仓库，无需调拨");
            return empty;
        }

        // 按SKU分组
        Map<String, List<ProductWarehousing>> skuGroups = inventory.stream()
                .collect(Collectors.groupingBy(this::makeSkuKey));

        // 为每个SKU生成调拨方案
        List<SkuTransferPlan> plans = new ArrayList<>();
        BigDecimal totalTransferCost = BigDecimal.ZERO;
        int totalTransferQty = 0;

        for (Map.Entry<String, List<ProductWarehousing>> entry : skuGroups.entrySet()) {
            SkuTransferPlan plan = generateSkuTransferPlan(entry.getKey(), entry.getValue());
            plans.add(plan);
            totalTransferQty += plan.getTotalTransferQuantity();
            if (plan.getEstimatedCost() != null) {
                totalTransferCost = totalTransferCost.add(plan.getEstimatedCost());
            }
        }

        TransferPlanResponse response = new TransferPlanResponse();
        response.setStyleNo(styleNo);
        response.setStyleName(inventory.get(0).getStyleName());
        response.setTotalSkus(skuGroups.size());
        response.setTotalTransferQuantity(totalTransferQty);
        response.setEstimatedTotalCost(totalTransferCost);
        response.setSkuTransferPlans(plans);
        response.setAnalysisDate(LocalDate.now());

        log.info("[InventoryTransfer] 调拨方案生成完成: styleNo={}, skus={}, totalQty={}, cost={}",
                styleNo, skuGroups.size(), totalTransferQty, totalTransferCost);

        return response;
    }

    /**
     * 批量生成调拨方案
     */
    public BatchTransferPlanResponse generateBatchTransferPlan(List<String> styleNos) {
        List<TransferPlanResponse> plans = new ArrayList<>();

        for (String styleNo : styleNos) {
            try {
                TransferPlanResponse plan = generateTransferPlan(styleNo);
                if (plan.getSkuTransferPlans() != null && !plan.getSkuTransferPlans().isEmpty()) {
                    plans.add(plan);
                }
            } catch (Exception e) {
                log.warn("[InventoryTransfer] 生成调拨方案失败: styleNo={}, error={}", styleNo, e.getMessage());
            }
        }

        // 计算总成本
        BigDecimal totalCost = plans.stream()
                .map(TransferPlanResponse::getEstimatedTotalCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        int totalQty = plans.stream()
                .mapToInt(TransferPlanResponse::getTotalTransferQuantity)
                .sum();

        BatchTransferPlanResponse response = new BatchTransferPlanResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalStyles(plans.size());
        response.setTotalTransferQuantity(totalQty);
        response.setEstimatedTotalCost(totalCost);
        response.setTransferPlans(plans);

        return response;
    }

    /**
     * 获取调拨需求分析报告
     */
    public TransferDemandResponse analyzeTransferDemand() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        QueryWrapper<ProductWarehousing> wrapper = new QueryWrapper<>();
        wrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse_area_id", "warehouse_area_name")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .gt("qualified_quantity", 0)
                .last("LIMIT 5000");

        List<ProductWarehousing> inventory = productWarehousingMapper.selectList(wrapper);

        // 按SKU分组分析
        Map<String, List<ProductWarehousing>> skuGroups = inventory.stream()
                .collect(Collectors.groupingBy(this::makeSkuKey));

        List<TransferDemandItem> demandItems = new ArrayList<>();
        int highDemandCount = 0;

        for (Map.Entry<String, List<ProductWarehousing>> entry : skuGroups.entrySet()) {
            TransferDemandItem item = analyzeSkuDemand(entry.getKey(), entry.getValue());
            demandItems.add(item);
            if ("HIGH".equals(item.getDemandLevel())) {
                highDemandCount++;
            }
        }

        // 排序
        demandItems.sort((a, b) -> {
            int levelCompare = getLevelOrder(b.getDemandLevel()) - getLevelOrder(a.getDemandLevel());
            return levelCompare != 0 ? levelCompare : Integer.compare(b.getTransferQuantity(), a.getTransferQuantity());
        });

        TransferDemandResponse response = new TransferDemandResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalSkus(demandItems.size());
        response.setHighDemandCount(highDemandCount);
        response.setDemandItems(demandItems);

        return response;
    }

    /**
     * 生成单个SKU的调拨方案
     */
    private SkuTransferPlan generateSkuTransferPlan(String sku, List<ProductWarehousing> inventory) {
        SkuTransferPlan plan = new SkuTransferPlan();
        plan.setSku(sku);

        // 计算总库存和平均库存
        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();
        int warehouseCount = inventory.size();
        int avgQty = totalQty / warehouseCount;

        // 找出过剩和不足的仓库
        List<WarehouseInventory> overstocked = new ArrayList<>();
        List<WarehouseInventory> understocked = new ArrayList<>();

        for (ProductWarehousing inv : inventory) {
            int qty = inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0;
            String warehouseId = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() : inv.getWarehouse();
            String warehouseName = inv.getWarehouseAreaName() != null ? inv.getWarehouseAreaName() : warehouseId;

            if (qty > avgQty * 1.2) {
                overstocked.add(new WarehouseInventory(warehouseId, warehouseName, qty, qty - avgQty));
            } else if (qty < avgQty * 0.8) {
                understocked.add(new WarehouseInventory(warehouseId, warehouseName, qty, avgQty - qty));
            }
        }

        // 生成调拨路径
        List<TransferPath> paths = new ArrayList<>();
        int totalTransferQty = 0;

        for (WarehouseInventory over : overstocked) {
            for (WarehouseInventory under : understocked) {
                int transferQty = Math.min(over.getExcess(), under.getNeed());
                if (transferQty > 0) {
                    TransferPath path = new TransferPath();
                    path.setFromWarehouse(over.getWarehouseId());
                    path.setFromWarehouseName(over.getWarehouseName());
                    path.setToWarehouse(under.getWarehouseId());
                    path.setToWarehouseName(under.getWarehouseName());
                    path.setQuantity(transferQty);
                    path.setEstimatedCost(calculateTransferCost(over.getWarehouseId(), under.getWarehouseId(), transferQty));
                    paths.add(path);

                    totalTransferQty += transferQty;
                    over.setExcess(over.getExcess() - transferQty);
                    under.setNeed(under.getNeed() - transferQty);
                }
            }
        }

        plan.setWarehouseCount(warehouseCount);
        plan.setTotalQuantity(totalQty);
        plan.setTotalTransferQuantity(totalTransferQty);
        plan.setTransferPaths(paths);

        // 计算总费用
        BigDecimal totalCost = paths.stream()
                .map(TransferPath::getEstimatedCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        plan.setEstimatedCost(totalCost);

        return plan;
    }

    /**
     * 分析SKU调拨需求
     */
    private TransferDemandItem analyzeSkuDemand(String sku, List<ProductWarehousing> inventory) {
        TransferDemandItem item = new TransferDemandItem();
        item.setSku(sku);

        int totalQty = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .sum();
        item.setTotalQuantity(totalQty);

        // 计算分布均衡度
        double avg = inventory.stream()
                .mapToInt(i -> i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0)
                .average()
                .orElse(1);

        double variance = inventory.stream()
                .mapToDouble(i -> {
                    int qty = i.getQualifiedQuantity() != null ? i.getQualifiedQuantity() : 0;
                    return Math.pow(qty - avg, 2);
                })
                .average()
                .orElse(0);

        double balanceScore = Math.max(0, 100 - Math.sqrt(variance) / avg * 100);

        // 计算调拨数量
        int transferQty = 0;
        for (ProductWarehousing inv : inventory) {
            int qty = inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0;
            transferQty += Math.abs(qty - (int) avg);
        }
        transferQty /= 2;

        item.setTransferQuantity(transferQty);
        item.setBalanceScore((int) Math.round(balanceScore));

        if (balanceScore < 60) {
            item.setDemandLevel("HIGH");
        } else if (balanceScore < 80) {
            item.setDemandLevel("MEDIUM");
        } else {
            item.setDemandLevel("LOW");
        }

        return item;
    }

    /**
     * 计算调拨成本（简化）
     */
    private BigDecimal calculateTransferCost(String from, String to, int quantity) {
        // 简化：每单位成本1元
        return BigDecimal.valueOf(quantity * 1.0).setScale(2, RoundingMode.HALF_UP);
    }

    private int getLevelOrder(String level) {
        return "HIGH".equals(level) ? 3 : "MEDIUM".equals(level) ? 2 : 1;
    }

    private String makeSkuKey(ProductWarehousing inv) {
        return (inv.getStyleNo() != null ? inv.getStyleNo() : "") + "|" +
                (inv.getColor() != null ? inv.getColor() : "") + "|" +
                (inv.getSize() != null ? inv.getSize() : "");
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class TransferPlanResponse {
        private String styleNo;
        private String styleName;
        private int totalSkus;
        private int totalTransferQuantity;
        private BigDecimal estimatedTotalCost;
        private List<SkuTransferPlan> skuTransferPlans;
        private LocalDate analysisDate;
        private String message;
    }

    @Data
    public static class SkuTransferPlan {
        private String sku;
        private int warehouseCount;
        private int totalQuantity;
        private int totalTransferQuantity;
        private BigDecimal estimatedCost;
        private List<TransferPath> transferPaths;
    }

    @Data
    public static class TransferPath {
        private String fromWarehouse;
        private String fromWarehouseName;
        private String toWarehouse;
        private String toWarehouseName;
        private int quantity;
        private BigDecimal estimatedCost;
    }

    @Data
    public static class WarehouseInventory {
        private String warehouseId;
        private String warehouseName;
        private int quantity;
        private int excess;
        private int need;

        public WarehouseInventory(String warehouseId, String warehouseName, int quantity, int excess) {
            this.warehouseId = warehouseId;
            this.warehouseName = warehouseName;
            this.quantity = quantity;
            this.excess = excess;
            this.need = Math.max(0, -excess);
        }
    }

    @Data
    public static class BatchTransferPlanResponse {
        private LocalDate analysisDate;
        private int totalStyles;
        private int totalTransferQuantity;
        private BigDecimal estimatedTotalCost;
        private List<TransferPlanResponse> transferPlans;
    }

    @Data
    public static class TransferDemandResponse {
        private LocalDate analysisDate;
        private int totalSkus;
        private int highDemandCount;
        private List<TransferDemandItem> demandItems;
    }

    @Data
    public static class TransferDemandItem {
        private String sku;
        private int totalQuantity;
        private int transferQuantity;
        private int balanceScore;
        private String demandLevel;
    }
}
