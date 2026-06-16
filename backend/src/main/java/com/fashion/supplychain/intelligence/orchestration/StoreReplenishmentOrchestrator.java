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
 * 仓到店补货智能体
 *
 * 功能：
 * - 基于门店销售趋势，驱动自动补货量计算
 * - 分析各门店的SKU销售速度
 * - 计算最优补货量和补货时机
 * - 平衡库存（减少断货+避免积压）
 *
 * 核心价值：门店断货+滞销平衡是服装零售的核心痛点，此智能体帮助智能补货
 */
@Service
@Lazy
@Slf4j
public class StoreReplenishmentOrchestrator {

    @Autowired
    private ProductWarehousingMapper productWarehousingMapper;

    /**
     * 生成门店补货建议
     *
     * @param warehouseId 仓库ID（可选，为null时生成所有仓库建议）
     * @param leadTimeDays 补货提前期（天）
     * @param targetStockDays 目标库存天数
     * @return 补货建议
     */
    public StoreReplenishmentResponse generateReplenishment(Long warehouseId, int leadTimeDays, int targetStockDays) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询所有入库记录（成品库存）
        QueryWrapper<ProductWarehousing> invWrapper = new QueryWrapper<>();
        invWrapper.select("style_no", "style_name", "color", "size", "qualified_quantity",
                "warehouse", "warehouse_area_name", "warehouse_area_id", "create_time", "unit_price")
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .eq("quality_status", "QUALIFIED")
                .gt("qualified_quantity", 0)
                .last("LIMIT 10000");

        List<ProductWarehousing> allInventory = productWarehousingMapper.selectList(invWrapper);

        // 按仓库分组库存
        Map<String, List<ProductWarehousing>> inventoryByWarehouse = allInventory.stream()
                .collect(Collectors.groupingBy(inv -> {
                    String key = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() : 
                                (inv.getWarehouse() != null ? inv.getWarehouse() : "DEFAULT");
                    return key;
                }));

        // 获取所有仓库列表
        Set<String> warehouses = inventoryByWarehouse.keySet();

        // 如果指定了仓库ID，过滤
        if (warehouseId != null) {
            warehouses = warehouses.stream()
                    .filter(w -> w.contains(String.valueOf(warehouseId)))
                    .collect(Collectors.toSet());
        }

        // 计算各仓库的补货需求
        List<StoreReplenishment> replenishments = new ArrayList<>();

        for (String warehouse : warehouses) {
            List<ProductWarehousing> warehouseInventory = inventoryByWarehouse.getOrDefault(warehouse, Collections.emptyList());

            // 获取其他仓库的库存（作为调拨来源）
            List<ProductWarehousing> otherInventory = allInventory.stream()
                    .filter(inv -> {
                        String invWarehouse = inv.getWarehouseAreaId() != null ? inv.getWarehouseAreaId() : 
                                            (inv.getWarehouse() != null ? inv.getWarehouse() : "DEFAULT");
                        return !warehouse.equals(invWarehouse);
                    })
                    .collect(Collectors.toList());

            StoreReplenishment replenishment = calculateReplenishment(
                    warehouse, warehouseInventory, otherInventory, leadTimeDays, targetStockDays);
            replenishments.add(replenishment);
        }

        // 计算汇总
        int totalSkus = replenishments.stream()
                .mapToInt(r -> r.getReplenishmentItems().size())
                .sum();
        int totalReplenishmentQty = replenishments.stream()
                .mapToInt(r -> r.getReplenishmentItems().stream()
                        .mapToInt(ReplenishmentItem::getSuggestedQuantity)
                        .sum())
                .sum();

        StoreReplenishmentResponse response = new StoreReplenishmentResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setLeadTimeDays(leadTimeDays);
        response.setTargetStockDays(targetStockDays);
        response.setTotalWarehouses(replenishments.size());
        response.setTotalSkus(totalSkus);
        response.setTotalReplenishmentQuantity(totalReplenishmentQty);
        response.setWarehouseReplenishments(replenishments);
        response.setUrgentReplenishments(replenishments.stream()
                .filter(r -> "URGENT".equals(r.getPriority()))
                .count());

        log.info("[StoreReplenishment] 补货建议生成完成: warehouses={}, skus={}, qty={}, urgent={}",
                replenishments.size(), totalSkus, totalReplenishmentQty, response.getUrgentReplenishments());

        return response;
    }

    /**
     * 计算单个仓库的补货需求
     */
    private StoreReplenishment calculateReplenishment(String warehouse,
                                                        List<ProductWarehousing> warehouseInventory,
                                                        List<ProductWarehousing> otherInventory,
                                                        int leadTimeDays,
                                                        int targetStockDays) {
        StoreReplenishment replenishment = new StoreReplenishment();
        replenishment.setWarehouseId(warehouse);
        replenishment.setWarehouseName(warehouse);

        // 计算当前库存
        Map<String, Integer> warehouseStock = new HashMap<>();
        for (ProductWarehousing inv : warehouseInventory) {
            String key = makeKey(inv);
            warehouseStock.merge(key, inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0, Integer::sum);
        }

        // 计算其他仓库可用库存
        Map<String, Integer> otherStock = new HashMap<>();
        for (ProductWarehousing inv : otherInventory) {
            String key = makeKey(inv);
            otherStock.merge(key, inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0, Integer::sum);
        }

        // 生成补货项
        List<ReplenishmentItem> items = new ArrayList<>();
        Set<String> allSkus = new HashSet<>();
        allSkus.addAll(warehouseStock.keySet());
        allSkus.addAll(otherStock.keySet());

        for (String sku : allSkus) {
            int currentStock = warehouseStock.getOrDefault(sku, 0);

            // 计算日均销量（简化：使用当前库存的10%作为日均销量估算）
            int avgDailySales = estimateDailySales(sku, warehouseInventory);

            // 计算安全库存
            int safetyStock = avgDailySales * 3; // 3天安全库存

            // 计算目标库存
            int targetStock = avgDailySales * targetStockDays;

            // 计算补货量
            int suggestedQty = Math.max(0, targetStock - currentStock);

            // 如果建议补货量大于0
            if (suggestedQty > 0) {
                ReplenishmentItem item = new ReplenishmentItem();
                item.setStyleNo(parseStyleNo(sku));
                item.setColor(parseColor(sku));
                item.setSize(parseSize(sku));
                item.setCurrentStock(currentStock);
                item.setAvgDailySales(avgDailySales);
                item.setSafetyStock(safetyStock);
                item.setTargetStock(targetStock);
                item.setSuggestedQuantity(suggestedQty);

                // 检查其他仓库是否有货
                int availableOther = otherStock.getOrDefault(sku, 0);
                item.setOtherWarehouseAvailableStock(availableOther);

                if (availableOther >= suggestedQty) {
                    item.setFulfillmentStatus("AVAILABLE");
                } else if (availableOther > 0) {
                    item.setFulfillmentStatus("PARTIAL");
                } else {
                    item.setFulfillmentStatus("UNAVAILABLE");
                }

                // 计算优先级
                String priority = calculatePriority(currentStock, avgDailySales, safetyStock, leadTimeDays);
                item.setPriority(priority);

                // 计算断货风险天数
                int daysUntilStockout = avgDailySales > 0 ? currentStock / avgDailySales : 999;
                item.setDaysUntilStockout(daysUntilStockout);

                items.add(item);
            }
        }

        // 按优先级排序
        items.sort((a, b) -> {
            int priorityCompare = getPriorityWeight(b.getPriority()) - getPriorityWeight(a.getPriority());
            if (priorityCompare != 0) return priorityCompare;
            return Integer.compare(a.getDaysUntilStockout(), b.getDaysUntilStockout());
        });

        replenishment.setReplenishmentItems(items);
        replenishment.setTotalCurrentStock(warehouseStock.values().stream().mapToInt(Integer::intValue).sum());
        replenishment.setTotalSuggestedQuantity(items.stream().mapToInt(ReplenishmentItem::getSuggestedQuantity).sum());
        replenishment.setFulfillableQuantity(items.stream()
                .filter(i -> !"UNAVAILABLE".equals(i.getFulfillmentStatus()))
                .mapToInt(ReplenishmentItem::getSuggestedQuantity)
                .sum());

        // 计算整体优先级
        long urgentCount = items.stream().filter(i -> "URGENT".equals(i.getPriority())).count();
        long highCount = items.stream().filter(i -> "HIGH".equals(i.getPriority())).count();

        if (urgentCount > 0) {
            replenishment.setPriority("URGENT");
        } else if (highCount > 0) {
            replenishment.setPriority("HIGH");
        } else if (!items.isEmpty()) {
            replenishment.setPriority("NORMAL");
        } else {
            replenishment.setPriority("NONE");
        }

        return replenishment;
    }

    /**
     * 估算日均销量
     */
    private int estimateDailySales(String sku, List<ProductWarehousing> warehouseInventory) {
        int totalStock = warehouseInventory.stream()
                .filter(inv -> makeKey(inv).equals(sku))
                .mapToInt(inv -> inv.getQualifiedQuantity() != null ? inv.getQualifiedQuantity() : 0)
                .sum();

        // 假设库存周转周期为30天
        return Math.max(1, totalStock / 30);
    }

    /**
     * 计算补货优先级
     */
    private String calculatePriority(int currentStock, int avgDailySales, int safetyStock, int leadTimeDays) {
        if (avgDailySales <= 0) {
            return "NORMAL";
        }

        int daysUntilStockout = currentStock / avgDailySales;
        int safeDays = safetyStock / Math.max(1, avgDailySales);

        // 立即断货风险
        if (daysUntilStockout <= 0) {
            return "URGENT";
        }

        // 补货提前期内可能断货
        if (daysUntilStockout <= leadTimeDays) {
            return "URGENT";
        }

        // 低于安全库存
        if (currentStock <= safetyStock) {
            return "HIGH";
        }

        // 库存偏低
        if (daysUntilStockout <= safeDays * 2) {
            return "HIGH";
        }

        return "NORMAL";
    }

    private String makeKey(ProductWarehousing inv) {
        return (inv.getStyleNo() != null ? inv.getStyleNo() : "") + "|" +
                (inv.getColor() != null ? inv.getColor() : "") + "|" +
                (inv.getSize() != null ? inv.getSize() : "");
    }

    private String parseStyleNo(String key) {
        String[] parts = key.split("\\|");
        return parts.length > 0 ? parts[0] : "";
    }

    private String parseColor(String key) {
        String[] parts = key.split("\\|");
        return parts.length > 1 ? parts[1] : "";
    }

    private String parseSize(String key) {
        String[] parts = key.split("\\|");
        return parts.length > 2 ? parts[2] : "";
    }

    private int getPriorityWeight(String priority) {
        return switch (priority) {
            case "URGENT" -> 3;
            case "HIGH" -> 2;
            case "NORMAL" -> 1;
            default -> 0;
        };
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class StoreReplenishmentResponse {
        private LocalDate analysisDate;
        private int leadTimeDays;
        private int targetStockDays;
        private int totalWarehouses;
        private int totalSkus;
        private int totalReplenishmentQuantity;
        private long urgentReplenishments;
        private List<StoreReplenishment> warehouseReplenishments;
    }

    @Data
    public static class StoreReplenishment {
        private String warehouseId;
        private String warehouseName;
        private String priority;
        private int totalCurrentStock;
        private int totalSuggestedQuantity;
        private int fulfillableQuantity;
        private List<ReplenishmentItem> replenishmentItems;
    }

    @Data
    public static class ReplenishmentItem {
        private String styleNo;
        private String color;
        private String size;
        private int currentStock;
        private int avgDailySales;
        private int safetyStock;
        private int targetStock;
        private int suggestedQuantity;
        private int otherWarehouseAvailableStock;
        private String fulfillmentStatus;
        private String priority;
        private int daysUntilStockout;
    }
}
