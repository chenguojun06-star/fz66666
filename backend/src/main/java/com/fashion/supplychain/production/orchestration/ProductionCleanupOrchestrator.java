package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionCleanupOrchestrator {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    /**
     * 清理错误创建的虚拟采购记录
     */
    @Transactional(rollbackFor = Exception.class)
    public void cleanupFakeProcurementRecords() {
        log.info("Starting cleanup of fake procurement records...");
        try {
            boolean removed = scanRecordService.remove(new LambdaQueryWrapper<ScanRecord>()
                    .likeRight(ScanRecord::getRequestId, "ORDER_PROCUREMENT:"));
            log.info("Cleanup fake procurement records result: {}", removed);
        } catch (Exception e) {
            log.warn("Failed to cleanup fake procurement records", e);
        }
    }

    /**
     * 清理无效的孤儿数据（如：关联订单已删除的采购单）
     * 建议在系统启动时或定时执行
     */
    @Transactional(rollbackFor = Exception.class)
    public void cleanupOrphanData() {
        log.info("Starting orphan data cleanup...");

        // 0. 清理虚拟采购记录
        cleanupFakeProcurementRecords();

        // 1. 清理孤儿采购单
        List<MaterialPurchase> purchases = materialPurchaseService.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .select(MaterialPurchase::getId, MaterialPurchase::getOrderId, MaterialPurchase::getPurchaseNo));

        if (purchases != null && !purchases.isEmpty()) {
            List<String> orphanIds = new ArrayList<>();
            for (MaterialPurchase p : purchases) {
                if (p == null || !StringUtils.hasText(p.getOrderId())) {
                    continue;
                }
                String orderId = p.getOrderId().trim();
                ProductionOrder order = productionOrderService.getById(orderId);
                // 如果订单不存在，或者已删除
                if (order == null || (order.getDeleteFlag() != null && order.getDeleteFlag() != 0)) {
                    orphanIds.add(p.getId());
                    log.info("Found orphan purchase order: {} (orderId: {})", p.getPurchaseNo(), orderId);
                }
            }

            if (!orphanIds.isEmpty()) {
                MaterialPurchase patch = new MaterialPurchase();
                patch.setDeleteFlag(1);
                patch.setUpdateTime(LocalDateTime.now());
                patch.setRemark("System cleanup orphan");
                materialPurchaseService.update(patch, new LambdaQueryWrapper<MaterialPurchase>()
                        .in(MaterialPurchase::getId, orphanIds));
                log.info("Cleaned up {} orphan purchase orders.", orphanIds.size());
            }
        }

        // 2. 清理重复的采购单（同一订单、同一物料的重复记录）
        cleanupDuplicatePurchases();

        log.info("Orphan data cleanup completed.");
    }

    private void cleanupDuplicatePurchases() {
        List<MaterialPurchase> allPurchases = materialPurchaseService.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0));

        if (allPurchases == null || allPurchases.isEmpty()) {
            return;
        }

        // 1. Deduplicate identical items (same material signature)
        deduplicateItems(allPurchases);
    }

    private void deduplicateItems(List<MaterialPurchase> allPurchases) {
        // 分组：OrderId -> (MaterialSignature -> List<Purchase>)
        Map<String, Map<String, List<MaterialPurchase>>> byOrderAndMaterial = new HashMap<>();

        for (MaterialPurchase p : allPurchases) {
            if (p == null || !StringUtils.hasText(p.getOrderId())) {
                continue;
            }
            String orderId = p.getOrderId().trim();
            String signature = getMaterialSignature(p);

            byOrderAndMaterial
                    .computeIfAbsent(orderId, k -> new HashMap<>())
                    .computeIfAbsent(signature, k -> new ArrayList<>())
                    .add(p);
        }

        List<String> duplicateIds = new ArrayList<>();

        for (Map<String, List<MaterialPurchase>> materials : byOrderAndMaterial.values()) {
            for (List<MaterialPurchase> group : materials.values()) {
                if (group.size() > 1) {
                    // 按创建时间倒序排序（保留最新的）
                    group.sort((a, b) -> {
                        LocalDateTime t1 = a.getCreateTime() != null ? a.getCreateTime() : LocalDateTime.MIN;
                        LocalDateTime t2 = b.getCreateTime() != null ? b.getCreateTime() : LocalDateTime.MIN;
                        return t2.compareTo(t1);
                    });

                    // 标记除了第一个之外的所有记录为删除
                    for (int i = 1; i < group.size(); i++) {
                        duplicateIds.add(group.get(i).getId());
                    }
                }
            }
        }

        if (!duplicateIds.isEmpty()) {
            MaterialPurchase patch = new MaterialPurchase();
            patch.setDeleteFlag(1);
            patch.setUpdateTime(LocalDateTime.now());
            patch.setRemark("System cleanup duplicate");
            materialPurchaseService.update(patch, new LambdaQueryWrapper<MaterialPurchase>()
                    .in(MaterialPurchase::getId, duplicateIds));
            log.info("Cleaned up {} duplicate purchase orders.", duplicateIds.size());
        }
    }

    private String getMaterialSignature(MaterialPurchase p) {
        return String.join("|",
                safe(p.getMaterialType()),
                safe(p.getMaterialCode()),
                safe(p.getMaterialName()),
                safe(p.getSpecifications()),
                safe(p.getUnit()),
                safe(p.getSupplierName()));
    }

    private String safe(String v) {
        return v == null ? "" : v.trim();
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cleanupSince(LocalDateTime cutoff) {
        if (cutoff == null) {
            throw new IllegalArgumentException("参数错误");
        }

        LocalDateTime now = LocalDateTime.now();
        Set<String> touchedOrderIds = new LinkedHashSet<>();

        List<ScanRecord> scanToDelete = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                .select(ScanRecord::getId, ScanRecord::getOrderId)
                .and(w -> w.ge(ScanRecord::getScanTime, cutoff).or().ge(ScanRecord::getCreateTime, cutoff)));
        if (scanToDelete != null) {
            for (ScanRecord r : scanToDelete) {
                if (r != null && StringUtils.hasText(r.getOrderId())) {
                    touchedOrderIds.add(r.getOrderId().trim());
                }
            }
        }
        int scanDeleted = scanToDelete == null ? 0 : scanToDelete.size();
        if (scanDeleted > 0) {
            scanRecordService.remove(new LambdaQueryWrapper<ScanRecord>()
                    .and(w -> w.ge(ScanRecord::getScanTime, cutoff).or().ge(ScanRecord::getCreateTime, cutoff)));
        }

        List<ProductWarehousing> whToDelete = productWarehousingService
                .list(new LambdaQueryWrapper<ProductWarehousing>()
                        .select(ProductWarehousing::getId, ProductWarehousing::getOrderId)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .ge(ProductWarehousing::getCreateTime, cutoff));
        if (whToDelete != null) {
            for (ProductWarehousing w : whToDelete) {
                if (w != null && StringUtils.hasText(w.getOrderId())) {
                    touchedOrderIds.add(w.getOrderId().trim());
                }
            }
        }
        int warehousingDeleted = whToDelete == null ? 0 : whToDelete.size();
        if (warehousingDeleted > 0) {
            productWarehousingService.lambdaUpdate()
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .ge(ProductWarehousing::getCreateTime, cutoff)
                    .set(ProductWarehousing::getDeleteFlag, 1)
                    .set(ProductWarehousing::getUpdateTime, now)
                    .update();
        }

        List<ProductOutstock> osToDelete = productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                .select(ProductOutstock::getId, ProductOutstock::getOrderId)
                .eq(ProductOutstock::getDeleteFlag, 0)
                .ge(ProductOutstock::getCreateTime, cutoff));
        if (osToDelete != null) {
            for (ProductOutstock o : osToDelete) {
                if (o != null && StringUtils.hasText(o.getOrderId())) {
                    touchedOrderIds.add(o.getOrderId().trim());
                }
            }
        }
        int outstockDeleted = osToDelete == null ? 0 : osToDelete.size();
        if (outstockDeleted > 0) {
            productOutstockService.lambdaUpdate()
                    .eq(ProductOutstock::getDeleteFlag, 0)
                    .ge(ProductOutstock::getCreateTime, cutoff)
                    .set(ProductOutstock::getDeleteFlag, 1)
                    .set(ProductOutstock::getUpdateTime, now)
                    .update();
        }

        List<MaterialPurchase> mpToDelete = materialPurchaseService.list(new LambdaQueryWrapper<MaterialPurchase>()
                .select(MaterialPurchase::getId, MaterialPurchase::getOrderId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .ge(MaterialPurchase::getCreateTime, cutoff));
        if (mpToDelete != null) {
            for (MaterialPurchase p : mpToDelete) {
                if (p != null && StringUtils.hasText(p.getOrderId())) {
                    touchedOrderIds.add(p.getOrderId().trim());
                }
            }
        }
        int purchaseDeleted = mpToDelete == null ? 0 : mpToDelete.size();
        if (purchaseDeleted > 0) {
            materialPurchaseService.lambdaUpdate()
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .ge(MaterialPurchase::getCreateTime, cutoff)
                    .set(MaterialPurchase::getDeleteFlag, 1)
                    .set(MaterialPurchase::getUpdateTime, now)
                    .update();
        }

        int recomputedOrders = 0;
        for (String oid : touchedOrderIds) {
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            try {
                productionOrderService.recomputeProgressFromRecords(oid.trim());
                recomputedOrders++;
            } catch (Exception e) {
                log.warn("Failed to recompute progress after cleanup: orderId={}", oid, e);
            }
        }

        Map<String, Object> data = new HashMap<>();
        data.put("from", cutoff);
        data.put("scanDeleted", scanDeleted);
        data.put("warehousingDeleted", warehousingDeleted);
        data.put("outstockDeleted", outstockDeleted);
        data.put("purchaseDeleted", purchaseDeleted);
        data.put("touchedOrders", touchedOrderIds.size());
        data.put("recomputedOrders", recomputedOrders);
        return data;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> deleteFullLinkByOrderKey(String orderKey) {
        String key = StringUtils.hasText(orderKey) ? orderKey.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder order = productionOrderService.getById(key);
        if (order == null) {
            order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, key)
                    .last("limit 1"));
        }
        if (order == null || !StringUtils.hasText(order.getId())) {
            throw new NoSuchElementException("生产订单不存在");
        }
        String oid = order.getId().trim();

        LocalDateTime now = LocalDateTime.now();

        List<CuttingBundle> bundles = cuttingBundleService.list(new LambdaQueryWrapper<CuttingBundle>()
                .select(CuttingBundle::getId)
                .eq(CuttingBundle::getProductionOrderId, oid));
        List<String> bundleIds = new ArrayList<>();
        if (bundles != null) {
            for (CuttingBundle b : bundles) {
                if (b != null && StringUtils.hasText(b.getId())) {
                    bundleIds.add(b.getId().trim());
                }
            }
        }

        List<MaterialPurchase> purchases = materialPurchaseService.list(new LambdaQueryWrapper<MaterialPurchase>()
                .select(MaterialPurchase::getId)
                .eq(MaterialPurchase::getOrderId, oid));
        List<String> purchaseIds = new ArrayList<>();
        if (purchases != null) {
            for (MaterialPurchase p : purchases) {
                if (p != null && StringUtils.hasText(p.getId())) {
                    purchaseIds.add(p.getId().trim());
                }
            }
        }

        List<String> shipmentRecIds = new ArrayList<>();
        List<ShipmentReconciliation> shipmentRecs = shipmentReconciliationService.list(
                new LambdaQueryWrapper<ShipmentReconciliation>()
                        .select(ShipmentReconciliation::getId)
                        .eq(ShipmentReconciliation::getOrderId, oid));
        if (shipmentRecs != null) {
            for (ShipmentReconciliation r : shipmentRecs) {
                if (r != null && StringUtils.hasText(r.getId())) {
                    shipmentRecIds.add(r.getId().trim());
                }
            }
        }

        int scanDeleted = 0;
        scanDeleted += scanRecordService.count(new LambdaQueryWrapper<ScanRecord>().eq(ScanRecord::getOrderId, oid));
        scanRecordService.remove(new LambdaQueryWrapper<ScanRecord>().eq(ScanRecord::getOrderId, oid));
        if (!bundleIds.isEmpty()) {
            scanDeleted += scanRecordService
                    .count(new LambdaQueryWrapper<ScanRecord>().in(ScanRecord::getCuttingBundleId, bundleIds));
            scanRecordService
                    .remove(new LambdaQueryWrapper<ScanRecord>().in(ScanRecord::getCuttingBundleId, bundleIds));
        }

        long warehousingSoftDeleted = productWarehousingService.count(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getDeleteFlag, 0));
        if (warehousingSoftDeleted > 0) {
            productWarehousingService.lambdaUpdate()
                    .eq(ProductWarehousing::getOrderId, oid)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .set(ProductWarehousing::getDeleteFlag, 1)
                    .set(ProductWarehousing::getUpdateTime, now)
                    .update();
        }

        long outstockSoftDeleted = productOutstockService.count(new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getOrderId, oid)
                .eq(ProductOutstock::getDeleteFlag, 0));
        if (outstockSoftDeleted > 0) {
            productOutstockService.lambdaUpdate()
                    .eq(ProductOutstock::getOrderId, oid)
                    .eq(ProductOutstock::getDeleteFlag, 0)
                    .set(ProductOutstock::getDeleteFlag, 1)
                    .set(ProductOutstock::getUpdateTime, now)
                    .update();
        }

        long purchaseSoftDeleted = materialPurchaseService.count(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        if (purchaseSoftDeleted > 0) {
            materialPurchaseService.lambdaUpdate()
                    .eq(MaterialPurchase::getOrderId, oid)
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .set(MaterialPurchase::getDeleteFlag, 1)
                    .set(MaterialPurchase::getUpdateTime, now)
                    .update();
        }

        long materialRecDeleted = 0;
        if (!purchaseIds.isEmpty()) {
            materialRecDeleted = materialReconciliationService.count(new LambdaQueryWrapper<MaterialReconciliation>()
                    .in(MaterialReconciliation::getPurchaseId, purchaseIds)
                    .eq(MaterialReconciliation::getDeleteFlag, 0));
            if (materialRecDeleted > 0) {
                materialReconciliationService.lambdaUpdate()
                        .in(MaterialReconciliation::getPurchaseId, purchaseIds)
                        .eq(MaterialReconciliation::getDeleteFlag, 0)
                        .set(MaterialReconciliation::getDeleteFlag, 1)
                        .set(MaterialReconciliation::getUpdateTime, now)
                        .update();
            }
        }

        long cuttingTaskDeleted = cuttingTaskService.count(new LambdaQueryWrapper<CuttingTask>()
                .eq(CuttingTask::getProductionOrderId, oid));
        cuttingTaskService.remove(new LambdaQueryWrapper<CuttingTask>().eq(CuttingTask::getProductionOrderId, oid));

        int cuttingBundleDeleted;
        if (!bundleIds.isEmpty()) {
            cuttingBundleDeleted = bundleIds.size();
        } else {
            long cnt = cuttingBundleService.count(new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, oid));
            cuttingBundleDeleted = (int) Math.min(Integer.MAX_VALUE, Math.max(0L, cnt));
        }
        cuttingBundleService
                .remove(new LambdaQueryWrapper<CuttingBundle>().eq(CuttingBundle::getProductionOrderId, oid));

        int shipmentRecDeleted = 0;
        for (String id : shipmentRecIds) {
            if (!StringUtils.hasText(id)) {
                continue;
            }
            if (shipmentReconciliationService.removeById(id.trim())) {
                shipmentRecDeleted++;
            }
        }

        boolean orderSoftDeleted = productionOrderService.deleteById(oid);

        Map<String, Object> data = new HashMap<>();
        data.put("orderKey", key);
        data.put("orderId", oid);
        data.put("orderNo", order.getOrderNo());
        data.put("scanDeleted", scanDeleted);
        data.put("warehousingSoftDeleted", warehousingSoftDeleted);
        data.put("outstockSoftDeleted", outstockSoftDeleted);
        data.put("purchaseSoftDeleted", purchaseSoftDeleted);
        data.put("materialReconciliationDeleted", materialRecDeleted);
        data.put("cuttingTaskDeleted", cuttingTaskDeleted);
        data.put("cuttingBundleDeleted", cuttingBundleDeleted);
        data.put("shipmentReconciliationDeleted", shipmentRecDeleted);
        data.put("orderSoftDeleted", orderSoftDeleted);
        return data;
    }
}
