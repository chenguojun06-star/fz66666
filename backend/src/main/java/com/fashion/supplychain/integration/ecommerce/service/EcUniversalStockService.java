package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.mapper.EcUniversalStockMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
public class EcUniversalStockService extends ServiceImpl<EcUniversalStockMapper, EcUniversalStock> {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductSkuService productSkuService;

    public EcUniversalStock getOrCreate(Long tenantId, Long styleId, Long skuId, String skuCode, String warehouse) {
        LambdaQueryWrapper<EcUniversalStock> qw = new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId)
                .eq(EcUniversalStock::getSkuId, skuId);
        if (warehouse != null) {
            qw.eq(EcUniversalStock::getWarehouse, warehouse);
        } else {
            qw.isNull(EcUniversalStock::getWarehouse);
        }
        EcUniversalStock stock = getOne(qw, false);
        if (stock == null) {
            stock = new EcUniversalStock();
            stock.setTenantId(tenantId);
            stock.setStyleId(styleId);
            stock.setSkuId(skuId);
            stock.setSkuCode(skuCode);
            stock.setWarehouse(warehouse);
            stock.setTotalWarehoused(0);
            stock.setTotalOutstock(0);
            stock.setPendingOrders(0);
            stock.setAvailableStock(0);
            stock.setSafeStock(0);
            stock.setBufferStock(5);
            stock.setOnWayProduction(0);
            stock.setLastSyncTime(LocalDateTime.now());
            save(stock);
        } else if (stock.getSkuCode() == null && skuCode != null) {
            stock.setSkuCode(skuCode);
            updateById(stock);
        }
        return stock;
    }

    public void recalculateStock(Long tenantId, Long styleId, Long skuId) {
        ProductSku sku = skuId != null ? productSkuService.getById(skuId) : null;
        String skuCode = sku != null ? sku.getSkuCode() : null;
        Long safeStyleId = sku != null ? sku.getStyleId() : styleId;

        List<String> warehouses = listWarehousesForStyle(tenantId, safeStyleId, skuCode);
        boolean hasAnyWarehouseData = !warehouses.isEmpty();

        if (hasAnyWarehouseData) {
            for (String wh : warehouses) {
                EcUniversalStock stock = getOrCreate(tenantId, safeStyleId, skuId, skuCode, wh);
                recalculateSingle(stock);
                updateById(stock);
            }
        }

        EcUniversalStock total = getOrCreate(tenantId, safeStyleId, skuId, skuCode, null);
        int totalIn = hasAnyWarehouseData ? sumWarehoused(tenantId, safeStyleId, skuCode, null) : 0;
        int totalOut = hasAnyWarehouseData ? sumOutstocked(tenantId, safeStyleId, skuCode, null) : 0;
        int pending = sumPendingShip(tenantId, skuCode);
        int onWayProd = calculateOnWayProduction(tenantId, safeStyleId, sku);
        int buffer = 5;
        total.setTotalWarehoused(totalIn);
        total.setTotalOutstock(totalOut);
        total.setPendingOrders(pending);
        total.setOnWayProduction(onWayProd);
        total.setAvailableStock(Math.max(0, totalIn - totalOut - pending - buffer));
        total.setLastSyncTime(LocalDateTime.now());
        updateById(total);

        log.info("[EcUniversalStock] 重新计算库存: tenantId={}, skuId={}, skuCode={}, 可售={}, 在途生产={}",
                tenantId, skuId, skuCode, total.getAvailableStock(), onWayProd);
    }

    private int calculateOnWayProduction(Long tenantId, Long styleId, ProductSku sku) {
        if (productionOrderService == null || styleId == null) return 0;
        Set<String> inProgressStatuses = new HashSet<>();
        inProgressStatuses.add("pending");
        inProgressStatuses.add("production");
        inProgressStatuses.add("delayed");
        inProgressStatuses.add("paused");
        inProgressStatuses.add("returned");
        try {
            List<ProductionOrder> orders = productionOrderService.list(new QueryWrapper<ProductionOrder>()
                    .eq("style_id", String.valueOf(styleId))
                    .in("status", inProgressStatuses)
                    .eq("delete_flag", 0)
                    .eq("tenant_id", tenantId));
            int total = 0;
            String skuColor = sku != null ? sku.getColor() : null;
            String skuSize = sku != null ? sku.getSize() : null;
            for (ProductionOrder order : orders) {
                String orderColor = order.getColor() == null ? "" : order.getColor().trim().toLowerCase();
                String orderSize = order.getSize() == null ? "" : order.getSize().trim().toLowerCase();
                // 如果 SKU 有颜色/尺码，只匹配同色同码；否则汇总全部
                if (skuColor != null && skuSize != null) {
                    String normSkuColor = skuColor.trim().toLowerCase();
                    String normSkuSize = skuSize.trim().toLowerCase();
                    if (!orderColor.equals(normSkuColor) || !orderSize.equals(normSkuSize)) continue;
                }
                Integer orderQty = order.getOrderQuantity();
                Integer completedQty = order.getCompletedQuantity();
                int remaining = (orderQty == null ? 0 : orderQty) - (completedQty == null ? 0 : completedQty);
                if (remaining > 0) total += remaining;
            }
            return total;
        } catch (Exception e) {
            log.warn("[EcUniversalStock] 在途生产计算异常: styleId={}, {}", styleId, e.getMessage());
            return 0;
        }
    }

    private List<String> listWarehousesForStyle(Long tenantId, Long styleId, String skuCode) {
        // 优先用 skuCode 精确找仓库
        if (skuCode != null && !skuCode.isBlank()) {
            List<ProductWarehousing> skuWhs = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getWarehouse)
                            .eq(tenantId != null, ProductWarehousing::getTenantId, tenantId)
                            .eq(ProductWarehousing::getSkuCode, skuCode)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .notIn(ProductWarehousing::getWarehousingType, "quality_scan_scrap", "quality_scan")
                            .isNotNull(ProductWarehousing::getWarehouse)
                            .ne(ProductWarehousing::getWarehouse, "")
                            .last("GROUP BY warehouse"));
            if (!skuWhs.isEmpty()) {
                return skuWhs.stream().map(ProductWarehousing::getWarehouse).distinct().toList();
            }
        }
        // 兜底：用 styleId 找仓库
        if (styleId != null) {
            List<ProductWarehousing> styleWhs = productWarehousingService.list(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .select(ProductWarehousing::getWarehouse)
                            .eq(tenantId != null, ProductWarehousing::getTenantId, tenantId)
                            .eq(ProductWarehousing::getStyleId, String.valueOf(styleId))
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .notIn(ProductWarehousing::getWarehousingType, "quality_scan_scrap", "quality_scan")
                            .isNotNull(ProductWarehousing::getWarehouse)
                            .ne(ProductWarehousing::getWarehouse, "")
                            .last("GROUP BY warehouse"));
            return styleWhs.stream().map(ProductWarehousing::getWarehouse).distinct().toList();
        }
        return List.of();
    }

    private void recalculateSingle(EcUniversalStock stock) {
        // 优先用 skuCode 精确过滤；其次用 styleId
        String skuCode = stock.getSkuCode();
        Long styleId = stock.getStyleId();
        String warehouse = stock.getWarehouse();
        int warehoused = sumWarehoused(stock.getTenantId(), styleId, skuCode, warehouse);
        int outstocked = sumOutstocked(stock.getTenantId(), styleId, skuCode, warehouse);
        int pendingShip = 0;
        int buffer = stock.getBufferStock() != null ? stock.getBufferStock() : 5;

        stock.setTotalWarehoused(warehoused);
        stock.setTotalOutstock(outstocked);
        stock.setPendingOrders(pendingShip);
        stock.setAvailableStock(Math.max(0, warehoused - outstocked - pendingShip - buffer));
        stock.setLastSyncTime(LocalDateTime.now());
    }

    private int sumWarehoused(Long tenantId, Long styleId, String skuCode, String warehouse) {
        LambdaQueryWrapper<ProductWarehousing> qw = new LambdaQueryWrapper<ProductWarehousing>()
                .eq(tenantId != null, ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .notIn(ProductWarehousing::getWarehousingType, "quality_scan_scrap", "quality_scan");
        if (skuCode != null && !skuCode.isBlank()) {
            qw.eq(ProductWarehousing::getSkuCode, skuCode);
        } else if (styleId != null) {
            qw.eq(ProductWarehousing::getStyleId, String.valueOf(styleId));
        }
        if (warehouse != null) {
            qw.eq(ProductWarehousing::getWarehouse, warehouse);
        }
        List<ProductWarehousing> records = productWarehousingService.list(qw);
        return records.stream()
                .mapToInt(r -> r.getQualifiedQuantity() != null ? r.getQualifiedQuantity() : 0)
                .sum();
    }

    private int sumOutstocked(Long tenantId, Long styleId, String skuCode, String warehouse) {
        LambdaQueryWrapper<ProductOutstock> qw = new LambdaQueryWrapper<ProductOutstock>()
                .eq(tenantId != null, ProductOutstock::getTenantId, tenantId)
                .eq(ProductOutstock::getDeleteFlag, 0);
        if (skuCode != null && !skuCode.isBlank()) {
            qw.eq(ProductOutstock::getSkuCode, skuCode);
        } else if (styleId != null) {
            qw.eq(ProductOutstock::getStyleId, String.valueOf(styleId));
        }
        if (warehouse != null) {
            qw.eq(ProductOutstock::getWarehouse, warehouse);
        }
        List<ProductOutstock> records = productOutstockService.list(qw);
        return records.stream()
                .mapToInt(r -> r.getOutstockQuantity() != null ? r.getOutstockQuantity() : 0)
                .sum();
    }

    private int sumPendingShip(Long tenantId, String skuCode) {
        // warehouseStatus: 0=待拣货, 1=备货中, 2=已出库
        // pendingShip 只统计"备货中"状态，排除已出库(2)的
        LambdaQueryWrapper<EcommerceOrder> qw = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getStatus, 1)
                .in(EcommerceOrder::getWarehouseStatus, 0, 1);
        if (skuCode != null && !skuCode.isBlank()) {
            qw.eq(EcommerceOrder::getSkuCode, skuCode);
        }
        List<EcommerceOrder> orders = ecommerceOrderService.list(qw);
        return orders.stream()
                .mapToInt(o -> o.getQuantity() != null ? o.getQuantity() : 0)
                .sum();
    }

    public List<EcUniversalStock> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId)
                .orderByDesc(EcUniversalStock::getUpdateTime));
    }

    public List<EcUniversalStock> listLowStock(Long tenantId) {
        return list(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId)
                .apply("available_stock <= safe_stock")
                .orderByAsc(EcUniversalStock::getAvailableStock));
    }
}
