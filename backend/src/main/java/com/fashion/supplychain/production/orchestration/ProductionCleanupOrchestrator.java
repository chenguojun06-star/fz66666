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

    @Transactional
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

    @Transactional
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
