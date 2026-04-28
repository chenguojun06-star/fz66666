package com.fashion.supplychain.production.helper.picking;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 物料采购领料/出库 — 共享辅助方法集。
 *
 * <p>从原 {@code MaterialPurchasePickingHelper}（1114 行）拆出，
 * 提供：库存查询、可用库存计算、领取/用途类型解析、工厂快照解析、
 * 同步去重检查、备注构造等纯查询/纯计算工具方法。
 *
 * <p>本类不持有事务边界，可被 4 个事务 Helper（SmartReceive / Preview /
 * WarehousePick / Cancel）安全注入复用。
 */
@Component
@Slf4j
public class MaterialPurchasePickingSupport {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPickupRecordMapper materialPickupRecordMapper;

    // ───────────── 库存查询 / 缓存 ─────────────

    public String stockCacheKey(String materialCode, String color, String size) {
        return (materialCode == null ? "" : materialCode) + "|"
                + (color == null ? "" : color) + "|"
                + (size == null ? "" : size);
    }

    public int calcAvailableStock(List<MaterialStock> stockList) {
        if (stockList == null || stockList.isEmpty()) {
            return 0;
        }
        return stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();
    }

    public int calcAvailableStock(String materialCode, String color, String size) {
        return calcAvailableStock(queryStockList(materialCode, color, size));
    }

    public List<MaterialStock> queryStockList(String materialCode, String color, String size) {
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
        if (StringUtils.hasText(color)) {
            stockWrapper.eq(MaterialStock::getColor, color);
        }
        if (StringUtils.hasText(size)) {
            stockWrapper.eq(MaterialStock::getSize, size);
        }
        return materialStockService.list(stockWrapper);
    }

    public List<MaterialStock> queryStockByMaterial(MaterialPurchase purchase) {
        return queryStockList(purchase.getMaterialCode(), purchase.getColor(), purchase.getSize());
    }

    public Map<String, List<MaterialStock>> batchQueryStockByPurchases(List<MaterialPurchase> purchases) {
        Set<String> materialCodes = purchases.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (materialCodes.isEmpty()) {
            return Collections.emptyMap();
        }
        List<MaterialStock> allStocks = materialStockService.list(new LambdaQueryWrapper<MaterialStock>()
                .in(MaterialStock::getMaterialCode, materialCodes));
        return allStocks.stream()
                .collect(Collectors.groupingBy(s -> stockCacheKey(s.getMaterialCode(), s.getColor(), s.getSize())));
    }

    // ───────────── 领取类型 / 用途类型 ─────────────

    public String resolvePickupType(MaterialPurchase purchase) {
        return resolvePickupType(purchase, null);
    }

    public String resolvePickupType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getPickupType())) {
            return picking.getPickupType().trim();
        }
        if (purchase == null) {
            return "INTERNAL";
        }
        String factoryType = purchase.getFactoryType();
        if (!StringUtils.hasText(factoryType) && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                factoryType = order.getFactoryType();
            }
        }
        return StringUtils.hasText(factoryType) && "EXTERNAL".equalsIgnoreCase(factoryType.trim())
                ? "EXTERNAL"
                : "INTERNAL";
    }

    public String resolveUsageType(MaterialPurchase purchase) {
        return resolveUsageType(purchase, null);
    }

    public String resolveUsageType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getUsageType())) {
            return picking.getUsageType().trim();
        }
        if (purchase == null || !StringUtils.hasText(purchase.getSourceType())) {
            return "BULK";
        }
        String sourceType = purchase.getSourceType().trim().toLowerCase();
        if ("sample".equals(sourceType)) {
            return "SAMPLE";
        }
        if ("stock".equals(sourceType)) {
            return "STOCK";
        }
        return "BULK";
    }

    // ───────────── 工厂快照解析 ─────────────

    public FactorySnapshot resolveFactorySnapshot(MaterialPurchase purchase, MaterialPicking picking) {
        FactorySnapshot snapshot = new FactorySnapshot();
        if (purchase != null) {
            snapshot.factoryName = purchase.getFactoryName();
            snapshot.factoryType = purchase.getFactoryType();
        }
        String orderId = purchase != null ? purchase.getOrderId() : null;
        String orderNo = purchase != null ? purchase.getOrderNo() : null;
        if (picking != null) {
            if (!StringUtils.hasText(orderId)) {
                orderId = picking.getOrderId();
            }
            if (!StringUtils.hasText(orderNo)) {
                orderNo = picking.getOrderNo();
            }
        }
        ProductionOrder order = null;
        if (StringUtils.hasText(orderId)) {
            order = productionOrderService.getById(orderId.trim());
        }
        if (order == null && StringUtils.hasText(orderNo)) {
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
        }
        if (order != null) {
            snapshot.factoryId = order.getFactoryId();
            if (!StringUtils.hasText(snapshot.factoryName)) {
                snapshot.factoryName = order.getFactoryName();
            }
            if (!StringUtils.hasText(snapshot.factoryType)) {
                snapshot.factoryType = order.getFactoryType();
            }
        }
        if (!StringUtils.hasText(snapshot.factoryType) && purchase != null
                && StringUtils.hasText(purchase.getFactoryType())) {
            snapshot.factoryType = purchase.getFactoryType().trim();
        }
        if (!StringUtils.hasText(snapshot.factoryName) && purchase != null
                && StringUtils.hasText(purchase.getFactoryName())) {
            snapshot.factoryName = purchase.getFactoryName().trim();
        }
        return snapshot;
    }

    // ───────────── 同步备注 / 去重 ─────────────

    public String buildPickupRemark(MaterialPicking picking, MaterialPurchase purchase) {
        String sourceType = purchase == null ? null : purchase.getSourceType();
        String factoryType = purchase == null ? null : purchase.getFactoryType();
        String orderBizType = purchase == null ? null : purchase.getOrderBizType();

        if ((!StringUtils.hasText(factoryType) || !StringUtils.hasText(orderBizType))
                && purchase != null && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                if (!StringUtils.hasText(factoryType)) {
                    factoryType = order.getFactoryType();
                }
                if (!StringUtils.hasText(orderBizType)) {
                    orderBizType = order.getOrderBizType();
                }
            }
        }

        return "AUTO_PICKUP_SYNC"
                + "|sourceType=" + (StringUtils.hasText(sourceType) ? sourceType.trim() : "unknown")
                + "|factoryType=" + (StringUtils.hasText(factoryType) ? factoryType.trim() : "unknown")
                + "|orderBizType=" + (StringUtils.hasText(orderBizType) ? orderBizType.trim() : "unknown")
                + "|purchaseId=" + (purchase != null && StringUtils.hasText(purchase.getId()) ? purchase.getId().trim() : "")
                + "|purchaseNo=" + (purchase != null && StringUtils.hasText(purchase.getPurchaseNo()) ? purchase.getPurchaseNo().trim() : "")
                + "|pickingId=" + (picking != null && StringUtils.hasText(picking.getId()) ? picking.getId().trim() : "")
                + "|pickingNo=" + (picking != null && StringUtils.hasText(picking.getPickingNo()) ? picking.getPickingNo().trim() : "");
    }

    public boolean existsAutoSyncedPickupRecord(String syncRemark) {
        if (!StringUtils.hasText(syncRemark)) {
            return false;
        }
        Long count = materialPickupRecordMapper.selectCount(new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(MaterialPickupRecord::getRemark, syncRemark)
                .last("LIMIT 1"));
        return count != null && count > 0;
    }

    /**
     * 工厂快照值对象。从原 {@code MaterialPurchasePickingHelper.FactorySnapshot} 迁移至此。
     * 原类作为兼容子类保留在 Facade 中，外部调用方（如 ExternalFactoryMaterialDeductionHelper）
     * 可继续使用 {@code MaterialPurchasePickingSupport.FactorySnapshot} 类型。
     */
    public static class FactorySnapshot {
        public String factoryId;
        public String factoryName;
        public String factoryType;
    }
}
