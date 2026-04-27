package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class MaterialPurchaseServiceImpl extends ServiceImpl<MaterialPurchaseMapper, MaterialPurchase>
        implements MaterialPurchaseService {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPurchaseServiceHelper serviceHelper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean deleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return false;
        }
        return this.remove(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, orderId.trim()));
    }

    @Override
    public String resolveMaterialId(MaterialPurchase purchase) {
        return MaterialPurchaseHelper.resolveMaterialId(purchase);
    }

    @Override
    public IPage<MaterialPurchase> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        long page = ParamUtils.getPageLong(safeParams);
        long pageSize = ParamUtils.getPageSizeLong(safeParams);
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<MaterialPurchase> wrapper = buildQueryWrapper(safeParams, tenantId);
        IPage<MaterialPurchase> pageResult = baseMapper.selectPage(new Page<>(page, pageSize), wrapper);

        List<MaterialPurchase> records = pageResult == null ? null : pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            repairRecords(records);
            enrichFactoryInfo(records);
            enrichFromMaterialDatabase(records);
        }
        return pageResult;
    }

    private LambdaQueryWrapper<MaterialPurchase> buildQueryWrapper(Map<String, Object> safeParams, Long tenantId) {
        String purchaseNo = (String) safeParams.getOrDefault("purchaseNo", "");
        String materialCode = (String) safeParams.getOrDefault("materialCode", "");
        String materialName = (String) safeParams.getOrDefault("materialName", "");
        String supplierName = (String) safeParams.getOrDefault("supplierName", "");
        String supplier = (String) safeParams.getOrDefault("supplier", "");
        String status = (String) safeParams.getOrDefault("status", "");
        String orderNo = (String) safeParams.getOrDefault("orderNo", "");
        String styleNo = (String) safeParams.getOrDefault("styleNo", "");
        String materialType = (String) safeParams.getOrDefault("materialType", "");
        String sourceType = (String) safeParams.getOrDefault("sourceType", "");
        String factoryType = (String) safeParams.getOrDefault("factoryType", "");
        String factoryName = (String) safeParams.getOrDefault("factoryName", "");
        String receiverId = (String) safeParams.getOrDefault("receiverId", "");
        String receiverName = (String) safeParams.getOrDefault("receiverName", "");

        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getTenantId, tenantId);

        applyKeywordSearch(wrapper, orderNo, tenantId);
        applyBasicFilters(wrapper, purchaseNo, materialCode, materialName, styleNo, status, receiverId, receiverName, orderNo);
        applySourceTypeFilter(wrapper, sourceType);
        applyMaterialTypeFilter(wrapper, materialType);
        applySupplierFilter(wrapper, supplierName, supplier);
        excludeScrappedOrders(wrapper, tenantId);
        applyFactoryFilters(wrapper, tenantId, factoryType, factoryName);
        applyFactoryOrderIds(wrapper, safeParams);

        return wrapper;
    }

    private void applyKeywordSearch(LambdaQueryWrapper<MaterialPurchase> wrapper, String orderNo, Long tenantId) {
        if (!StringUtils.hasText(orderNo)) return;
        String keyword = orderNo.trim();
        List<String> matchedOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .and(w -> w.like(ProductionOrder::getFactoryName, keyword)
                        .or().like(ProductionOrder::getOrderNo, keyword)
                        .or().like(ProductionOrder::getStyleNo, keyword))
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                    .ne(ProductionOrder::getStatus, "scrapped"))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());

        wrapper.and(w -> {
            w.like(MaterialPurchase::getOrderNo, keyword)
                    .or().like(MaterialPurchase::getPurchaseNo, keyword)
                    .or().like(MaterialPurchase::getMaterialCode, keyword)
                    .or().like(MaterialPurchase::getMaterialName, keyword)
                    .or().like(MaterialPurchase::getSupplierName, keyword);
            if (!matchedOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, matchedOrderIds);
        });
    }

    private void applyBasicFilters(LambdaQueryWrapper<MaterialPurchase> wrapper,
            String purchaseNo, String materialCode, String materialName, String styleNo,
            String status, String receiverId, String receiverName, String orderNo) {
        wrapper.like(StringUtils.hasText(purchaseNo) && !StringUtils.hasText(orderNo), MaterialPurchase::getPurchaseNo, purchaseNo)
                .like(StringUtils.hasText(materialCode) && !StringUtils.hasText(orderNo), MaterialPurchase::getMaterialCode, materialCode)
                .like(StringUtils.hasText(materialName) && !StringUtils.hasText(orderNo), MaterialPurchase::getMaterialName, materialName)
                .like(StringUtils.hasText(styleNo), MaterialPurchase::getStyleNo, styleNo)
                .eq(StringUtils.hasText(receiverId), MaterialPurchase::getReceiverId, receiverId)
                .like(StringUtils.hasText(receiverName), MaterialPurchase::getReceiverName, receiverName)
                .and(StringUtils.hasText(status), w -> {
                    if ("partial".equals(status)) w.in(MaterialPurchase::getStatus, "partial", "partial_arrival");
                    else w.eq(MaterialPurchase::getStatus, status);
                })
                .orderByDesc(MaterialPurchase::getCreateTime);
    }

    private void applySourceTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String sourceType) {
        if (!StringUtils.hasText(sourceType)) return;
        if ("batch".equals(sourceType)) wrapper.in(MaterialPurchase::getSourceType, "batch", "stock", "manual");
        else wrapper.eq(MaterialPurchase::getSourceType, sourceType);
    }

    private void applyMaterialTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String materialType) {
        if (!StringUtils.hasText(materialType)) return;
        String mt = materialType.trim();
        if (MaterialConstants.TYPE_FABRIC.equals(mt) || MaterialConstants.TYPE_LINING.equals(mt) || MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
            wrapper.and(w -> {
                w.likeRight(MaterialPurchase::getMaterialType, mt);
                if (MaterialConstants.TYPE_FABRIC.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC_CN);
                else if (MaterialConstants.TYPE_LINING.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_LINING_CN);
                else if (MaterialConstants.TYPE_ACCESSORY.equals(mt)) w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY_CN);
            });
        } else {
            wrapper.eq(MaterialPurchase::getMaterialType, mt);
        }
    }

    private void applySupplierFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String supplierName, String supplier) {
        if (StringUtils.hasText(supplierName)) wrapper.like(MaterialPurchase::getSupplierName, supplierName);
        else if (StringUtils.hasText(supplier)) wrapper.like(MaterialPurchase::getSupplierName, supplier);
    }

    private void excludeScrappedOrders(LambdaQueryWrapper<MaterialPurchase> wrapper, Long tenantId) {
        List<String> scrappedOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .and(w -> w.eq(ProductionOrder::getDeleteFlag, 1).or().eq(ProductionOrder::getStatus, "scrapped")))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
        if (!scrappedOrderIds.isEmpty()) {
            wrapper.and(w -> w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "").or().notIn(MaterialPurchase::getOrderId, scrappedOrderIds));
        }
    }

    private void applyFactoryFilters(LambdaQueryWrapper<MaterialPurchase> wrapper, Long tenantId, String factoryType, String factoryName) {
        if (StringUtils.hasText(factoryType)) {
            List<String> ftOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId).eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryType, factoryType.trim().toUpperCase())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            wrapper.and(w -> { w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, ""); if (!ftOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, ftOrderIds); });
        }
        if (StringUtils.hasText(factoryName)) {
            List<String> fnOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId).eq(ProductionOrder::getTenantId, tenantId)
                            .like(ProductionOrder::getFactoryName, factoryName.trim())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            wrapper.and(w -> { w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, ""); if (!fnOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, fnOrderIds); });
        }
    }

    @SuppressWarnings("unchecked")
    private void applyFactoryOrderIds(LambdaQueryWrapper<MaterialPurchase> wrapper, Map<String, Object> safeParams) {
        List<String> factoryOrderIds = (List<String>) safeParams.get("_factoryOrderIds");
        if (factoryOrderIds != null && !factoryOrderIds.isEmpty()) wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
    }

    private void repairRecords(List<MaterialPurchase> records) {
        for (MaterialPurchase record : records) {
            if (record == null || !StringUtils.hasText(record.getId())) continue;
            serviceHelper.ensureSnapshot(record);
            if (record.getReturnConfirmed() != null && record.getReturnConfirmed() == 1) {
                Integer beforeArrivedQuantity = record.getArrivedQuantity();
                int arrived = beforeArrivedQuantity == null ? 0 : beforeArrivedQuantity;
                int rq = record.getReturnQuantity() == null ? 0 : record.getReturnQuantity();
                if (arrived != rq) {
                    record.setArrivedQuantity(rq);
                    if (record.getUnitPrice() != null) record.setTotalAmount(record.getUnitPrice().multiply(BigDecimal.valueOf(rq)));
                    int pq = record.getPurchaseQuantity() == null ? 0 : record.getPurchaseQuantity().intValue();
                    String s = record.getStatus() == null ? "" : record.getStatus().trim();
                    record.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(s, rq, pq));
                }
            }
            MaterialPurchaseHelper.repairReceiverFromRemark(record);
        }
    }

    private void enrichFactoryInfo(List<MaterialPurchase> records) {
        List<String> orderIds = records.stream()
                .map(MaterialPurchase::getOrderId).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (orderIds.isEmpty()) return;
        Map<String, ProductionOrder> factoryOrderMap = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getId, orderIds)
                        .select(ProductionOrder::getId, ProductionOrder::getFactoryName, ProductionOrder::getFactoryType))
                .stream().filter(o -> o != null && StringUtils.hasText(o.getId()))
                .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
        for (MaterialPurchase record : records) {
            String oid = record.getOrderId();
            if (StringUtils.hasText(oid) && factoryOrderMap.containsKey(oid.trim())) {
                ProductionOrder order = factoryOrderMap.get(oid.trim());
                record.setFactoryName(order.getFactoryName());
                record.setFactoryType(order.getFactoryType());
            }
        }
    }

    private void enrichFromMaterialDatabase(List<MaterialPurchase> records) {
        List<String> matCodes = records.stream()
                .map(MaterialPurchase::getMaterialCode).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (matCodes.isEmpty()) return;
        Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                new LambdaQueryWrapper<MaterialDatabase>()
                        .in(MaterialDatabase::getMaterialCode, matCodes)
                        .select(MaterialDatabase::getId, MaterialDatabase::getMaterialCode,
                                MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                MaterialDatabase::getUnitPrice, MaterialDatabase::getColor, MaterialDatabase::getSpecifications))
                .stream().filter(d -> d != null && StringUtils.hasText(d.getMaterialCode()))
                .collect(Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
        for (MaterialPurchase record : records) {
            MaterialDatabase db = dbMap.get(record.getMaterialCode());
            if (db == null) continue;
            if (!StringUtils.hasText(record.getFabricWidth())) record.setFabricWidth(db.getFabricWidth());
            if (!StringUtils.hasText(record.getFabricWeight())) record.setFabricWeight(db.getFabricWeight());
            if (!StringUtils.hasText(record.getFabricComposition())) record.setFabricComposition(db.getFabricComposition());
            if (!StringUtils.hasText(record.getSupplierName()) && StringUtils.hasText(db.getSupplierName())) record.setSupplierName(db.getSupplierName());
            if ((record.getUnitPrice() == null || record.getUnitPrice().compareTo(BigDecimal.ZERO) == 0) && db.getUnitPrice() != null) record.setUnitPrice(db.getUnitPrice());
            if (!StringUtils.hasText(record.getColor()) && StringUtils.hasText(db.getColor())) record.setColor(db.getColor());
            if (!StringUtils.hasText(record.getSpecifications()) && StringUtils.hasText(db.getSpecifications())) record.setSpecifications(db.getSpecifications());
        }
    }

    @Override
    public boolean existsActivePurchaseForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return false;
        }
        try {
            return this.count(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, oid)
                    .eq(MaterialPurchase::getDeleteFlag, 0)) > 0;
        } catch (Exception e) {
            log.warn("Failed to check purchases for order: orderId={}", oid, e);
            return false;
        }
    }

    @Override
    public boolean deleteById(String id) {
        return this.removeById(id);
    }

    @Override
    public boolean saveBatchPurchases(List<MaterialPurchase> purchases) {
        if (purchases == null || purchases.isEmpty()) {
            return true;
        }
        boolean allOk = true;
        for (MaterialPurchase purchase : purchases) {
            boolean ok = savePurchaseAndUpdateOrder(purchase);
            if (!ok) {
                allOk = false;
            }
        }
        return allOk;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean savePurchaseAndUpdateOrder(MaterialPurchase materialPurchase) {
        // 设置默认值
        LocalDateTime now = LocalDateTime.now();
        materialPurchase.setCreateTime(now);
        materialPurchase.setUpdateTime(now);
        materialPurchase.setDeleteFlag(0);
        materialPurchase.setArrivedQuantity(
                materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity());

        if (!StringUtils.hasText(materialPurchase.getPurchaseNo())) {
            materialPurchase.setPurchaseNo(serviceHelper.nextPurchaseNo());
        }

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus(MaterialConstants.STATUS_PENDING);
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }

        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        String status = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!MaterialConstants.STATUS_CANCELLED.equalsIgnoreCase(status)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity().intValue();
            materialPurchase.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(status, arrived, purchaseQty));
        }

        if ((MaterialConstants.STATUS_COMPLETED.equalsIgnoreCase(materialPurchase.getStatus())
                || MaterialConstants.STATUS_AWAITING_CONFIRM.equalsIgnoreCase(materialPurchase.getStatus()))
                && materialPurchase.getActualArrivalDate() == null) {
            materialPurchase.setActualArrivalDate(now);
        }

        // 确保 unit 字段有值，避免插入失败
        if (!StringUtils.hasText(materialPurchase.getUnit())) {
            materialPurchase.setUnit("-");
        }

        serviceHelper.ensureSnapshot(materialPurchase);

        // 保存物料采购记录
        boolean saved = this.save(materialPurchase);

        // 如果初始保存时就有到货数量，需要同步库存
        // 注意：sourceType="order" 的生产订单驱动采购不写入独立进销存，只有独立采购才写入
        if (saved) {
            int currentArrived = materialPurchase.getArrivedQuantity() == null ? 0
                    : materialPurchase.getArrivedQuantity();
            if (currentArrived > 0 && !isOrderDrivenPurchase(materialPurchase)) {
                try {
                    materialStockService.increaseStock(materialPurchase, currentArrived);
                } catch (Exception e) {
                    log.warn("Failed to init material stock on save: purchaseId={}, error={}", materialPurchase.getId(),
                            e.getMessage());
                }
            }
        }
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updatePurchaseAndUpdateOrder(MaterialPurchase materialPurchase) {
        // 获取旧数据以计算库存差异
        MaterialPurchase oldPurchase = null;
        if (StringUtils.hasText(materialPurchase.getId())) {
            oldPurchase = this.getById(materialPurchase.getId());
        }

        // 设置更新时间
        materialPurchase.setUpdateTime(LocalDateTime.now());

        if (!StringUtils.hasText(materialPurchase.getStatus())) {
            materialPurchase.setStatus(MaterialConstants.STATUS_PENDING);
        }

        if (materialPurchase.getUnitPrice() == null) {
            materialPurchase.setUnitPrice(BigDecimal.ZERO);
        }
        int arrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        materialPurchase.setTotalAmount(materialPurchase.getUnitPrice().multiply(BigDecimal.valueOf(arrived)));

        String status = materialPurchase.getStatus() == null ? "" : materialPurchase.getStatus().trim();
        if (!MaterialConstants.STATUS_CANCELLED.equalsIgnoreCase(status)) {
            int purchaseQty = materialPurchase.getPurchaseQuantity() == null ? 0
                    : materialPurchase.getPurchaseQuantity().intValue();
            materialPurchase.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(status, arrived, purchaseQty));
        }

        if ((MaterialConstants.STATUS_COMPLETED.equalsIgnoreCase(materialPurchase.getStatus())
                || MaterialConstants.STATUS_AWAITING_CONFIRM.equalsIgnoreCase(materialPurchase.getStatus()))
                && materialPurchase.getActualArrivalDate() == null) {
            materialPurchase.setActualArrivalDate(materialPurchase.getUpdateTime());
        }

        serviceHelper.ensureSnapshot(materialPurchase);

        // 更新物料采购记录
        boolean updated = this.updateById(materialPurchase);

        // 同步库存差异：生产订单驱动的采购（sourceType=order）不写入独立进销存
        if (updated && oldPurchase != null && !isOrderDrivenPurchase(materialPurchase)) {
            int oldArrived = oldPurchase.getArrivedQuantity() == null ? 0 : oldPurchase.getArrivedQuantity();
            int newArrived = arrived;
            int delta = newArrived - oldArrived;
            if (delta != 0) {
                try {
                    materialStockService.increaseStock(materialPurchase, delta);
                } catch (Exception e) {
                    log.warn("Failed to sync material stock on update: purchaseId={}, delta={}, error={}",
                            materialPurchase.getId(), delta, e.getMessage());
                    throw new RuntimeException("库存同步失败", e);
                }
            }
        }

        return updated;
    }

    @Override
    public ArrivalStats computeArrivalStatsByOrderId(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        ArrivalStats out = new ArrivalStats();
        out.setPlannedQty(0);
        out.setArrivedQty(0);
        out.setEffectiveArrivedQty(0);
        out.setPlannedAmount(BigDecimal.ZERO);
        out.setArrivedAmount(BigDecimal.ZERO);
        out.setArrivalRate(0);
        if (!StringUtils.hasText(oid)) {
            return out;
        }

        List<MaterialPurchase> list = this.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        return computeArrivalStats(list);
    }

    @Override
    public int computeEffectiveArrivedQuantity(int purchaseQty, int arrivedQty) {
        if (purchaseQty <= 0) {
            return 0;
        }

        int aq = Math.max(0, arrivedQty);
        return Math.min(aq, purchaseQty);
    }

    @Override
    public int sumConfirmedQuantityByOrderId(String orderId, boolean fabricOnly) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return 0;
        }
        List<MaterialPurchase> purchases = this.list(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        int total = 0;
        for (MaterialPurchase purchase : purchases) {
            if (purchase == null) {
                continue;
            }
            String status = StringUtils.hasText(purchase.getStatus()) ? purchase.getStatus().trim() : "";
            if ("cancelled".equalsIgnoreCase(status)) {
                continue;
            }
            if (fabricOnly) {
                String type = MaterialPurchaseHelper.normalizeMaterialType(purchase.getMaterialType());
                if (!type.startsWith(MaterialConstants.TYPE_FABRIC)) {
                    continue;
                }
            }
            if (purchase.getReturnConfirmed() == null || purchase.getReturnConfirmed() != 1) {
                continue;
            }
            total += Math.max(0, purchase.getReturnQuantity() == null ? 0 : purchase.getReturnQuantity());
        }
        return total;
    }

    @Override
    public boolean hasConfirmedQuantityByOrderId(String orderId, boolean fabricOnly) {
        return sumConfirmedQuantityByOrderId(orderId, fabricOnly) > 0;
    }

    @Override
    public ArrivalStats computeArrivalStats(List<MaterialPurchase> purchases) {
        ArrivalStats out = new ArrivalStats();
        int plannedQty = 0;
        int arrivedQty = 0;
        int effectiveArrivedQty = 0;
        BigDecimal plannedAmount = BigDecimal.ZERO;
        BigDecimal arrivedAmount = BigDecimal.ZERO;

        if (purchases != null) {
            for (MaterialPurchase p : purchases) {
                if (p == null) {
                    continue;
                }
                String st = p.getStatus() == null ? "" : p.getStatus().trim();
                if ("cancelled".equalsIgnoreCase(st)) {
                    continue;
                }
                int pq = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity().intValue();
                int aq = p.getArrivedQuantity() == null ? 0 : p.getArrivedQuantity();
                if (pq <= 0) {
                    continue;
                }

                int clampedArrived = Math.min(Math.max(0, aq), pq);
                int eff = computeEffectiveArrivedQuantity(pq, aq);

                plannedQty += pq;
                arrivedQty += clampedArrived;
                effectiveArrivedQty += eff;

                BigDecimal up = p.getUnitPrice();
                if (up != null) {
                    if (pq > 0) {
                        plannedAmount = plannedAmount.add(up.multiply(BigDecimal.valueOf(pq)));
                    }
                    if (eff > 0) {
                        arrivedAmount = arrivedAmount.add(up.multiply(BigDecimal.valueOf(eff)));
                    }
                } else {
                    BigDecimal ta = p.getTotalAmount();
                    if (ta != null) {
                        arrivedAmount = arrivedAmount.add(ta);
                    }
                }
            }
        }

        int rate = 0;
        if (plannedQty > 0) {
            rate = Math.min(100, (int) Math.round(effectiveArrivedQty * 100.0 / plannedQty));
        }

        out.setPlannedQty(Math.max(0, plannedQty));
        out.setArrivedQty(Math.max(0, arrivedQty));
        out.setEffectiveArrivedQty(Math.max(0, effectiveArrivedQty));
        out.setPlannedAmount(plannedAmount.setScale(2, RoundingMode.HALF_UP));
        out.setArrivedAmount(arrivedAmount.setScale(2, RoundingMode.HALF_UP));
        out.setArrivalRate(Math.max(0, rate));
        return out;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateArrivedQuantity(String id, Integer arrivedQuantity, String remark) {
        MaterialPurchase materialPurchase = this.getById(id);
        if (materialPurchase == null) {
            return false;
        }

        int oldArrived = materialPurchase.getArrivedQuantity() == null ? 0 : materialPurchase.getArrivedQuantity();
        int newArrived = arrivedQuantity == null ? 0 : arrivedQuantity;
        int delta = newArrived - oldArrived;

        log.info("updateArrivedQuantity: id={}, old={}, new={}, delta={}", id, oldArrived, newArrived, delta);

        if (delta == 0 && !StringUtils.hasText(remark)) {
            return true;
        }

        applyArrivedQuantityUpdate(materialPurchase, newArrived, remark);
        syncStockOnArrivedChange(materialPurchase, delta);

        return this.updateById(materialPurchase);
    }

    private void applyArrivedQuantityUpdate(MaterialPurchase mp, int newArrived, String remark) {
        mp.setArrivedQuantity(newArrived);
        mp.setUpdateTime(LocalDateTime.now());

        if (StringUtils.hasText(remark)) {
            String current = mp.getRemark() == null ? "" : mp.getRemark().trim();
            String next = remark.trim();
            if (StringUtils.hasText(current)) {
                if (!current.contains(next)) {
                    mp.setRemark(current + "；" + next);
                }
            } else {
                mp.setRemark(next);
            }
        }

        if (mp.getUnitPrice() != null) {
            mp.setTotalAmount(mp.getUnitPrice().multiply(BigDecimal.valueOf(newArrived)));
        }

        String currentStatus = mp.getStatus() == null ? "" : mp.getStatus().trim();
        if (!"cancelled".equals(currentStatus)) {
            int purchaseQty = mp.getPurchaseQuantity() == null ? 0 : mp.getPurchaseQuantity().intValue();
            String nextStatus = MaterialPurchaseHelper.resolveStatusByArrived(currentStatus, newArrived, purchaseQty);
            mp.setStatus(nextStatus);
            if ("completed".equalsIgnoreCase(nextStatus) && mp.getActualArrivalDate() == null) {
                mp.setActualArrivalDate(LocalDateTime.now());
            }
        }

        if (!StringUtils.hasText(mp.getUnit())) {
            mp.setUnit("-");
        }
    }

    private void syncStockOnArrivedChange(MaterialPurchase mp, int delta) {
        if (delta == 0 || isOrderDrivenPurchase(mp)) {
            return;
        }
        try {
            materialStockService.increaseStock(mp, delta);
        } catch (Exception e) {
            log.warn("Failed to sync material stock: purchaseId={}, delta={}, error={}", mp.getId(), delta, e.getMessage());
            throw new RuntimeException("库存同步失败", e);
        }
    }

    @Override
    public List<MaterialPurchase> previewDemandByOrderId(String orderId) {
        return serviceHelper.buildDemandItems(orderId, this);
    }

    @Override
    public List<MaterialPurchase> generateDemandByOrderId(String orderId, boolean overwrite) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("orderId不能为空");
        }

        long exists = this.count(new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getOrderId, orderId)
                .eq(MaterialPurchase::getDeleteFlag, 0));
        if (exists > 0 && !overwrite) {
            throw new IllegalStateException("该订单已生成采购需求");
        }

        if (exists > 0 && overwrite) {
            this.remove(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, orderId));
        }

        List<MaterialPurchase> items = serviceHelper.buildDemandItems(orderId, this);
        for (MaterialPurchase item : items) {
            savePurchaseAndUpdateOrder(item);
        }
        return items;
    }

    @Override
    public boolean receivePurchase(String purchaseId, String receiverId, String receiverName) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = this.getById(purchaseId);
        if (existed == null) {
            return false;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            return false;
        }

        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
        String normalizedStatus = status.toLowerCase();
        if (MaterialConstants.STATUS_COMPLETED.equals(normalizedStatus) || MaterialConstants.STATUS_AWAITING_CONFIRM.equals(normalizedStatus) || MaterialConstants.STATUS_CANCELLED.equals(normalizedStatus)) {
            return false;
        }

        String rid = StringUtils.hasText(receiverId) ? receiverId.trim() : null;
        String rname = StringUtils.hasText(receiverName) ? receiverName.trim() : null;
        boolean pending = MaterialConstants.STATUS_PENDING.equals(normalizedStatus) || !StringUtils.hasText(normalizedStatus);
        if (!pending) {
            return serviceHelper.isSameReceiver(existed, rid, rname);
        }

        String who = StringUtils.hasText(receiverName) ? receiverName.trim()
                : (StringUtils.hasText(receiverId) ? receiverId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        LocalDateTime now = LocalDateTime.now();
        String finalReceiverName = StringUtils.hasText(rname) ? rname : who;
        LambdaUpdateWrapper<MaterialPurchase> uw = new LambdaUpdateWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .and(w -> w.eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                        .or()
                        .eq(MaterialPurchase::getStatus, "PENDING")
                        .or()
                        .isNull(MaterialPurchase::getStatus)
                        .or()
                        .eq(MaterialPurchase::getStatus, ""))
                .set(MaterialPurchase::getReceiverId, rid)
                .set(MaterialPurchase::getReceiverName, finalReceiverName)
                .set(MaterialPurchase::getReceivedTime, now)
                .set(MaterialPurchase::getUpdateTime, now)
                .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED);

        boolean updated = this.update(uw);
        if (updated) {
            return true;
        }

        MaterialPurchase latest = this.getById(purchaseId);
        if (latest == null) {
            return false;
        }
        return serviceHelper.isSameReceiver(latest, rid, rname);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmReturnPurchase(String purchaseId, String confirmerId, String confirmerName,
            Integer returnQuantity) {
        if (!StringUtils.hasText(purchaseId)) {
            log.warn("confirmReturnPurchase: purchaseId为空");
            return false;
        }
        MaterialPurchase existed = loadPurchaseForReturn(purchaseId);
        if (existed == null) return false;

        validateReturnQuantity(existed, returnQuantity, purchaseId);

        String who = StringUtils.hasText(confirmerName) ? confirmerName.trim()
                : (StringUtils.hasText(confirmerId) ? confirmerId.trim() : "");
        if (!StringUtils.hasText(who)) who = "未命名";

        MaterialPurchase patch = buildReturnPatch(existed, confirmerId, confirmerName, returnQuantity, who);
        syncStockOnReturnConfirm(existed, returnQuantity, purchaseId);

        return persistReturnPatch(purchaseId, patch, existed, returnQuantity, confirmerId, confirmerName, who);
    }

    private MaterialPurchase loadPurchaseForReturn(String purchaseId) {
        MaterialPurchase existed = this.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getDeleteFlag,
                                MaterialPurchase::getStatus, MaterialPurchase::getPurchaseQuantity,
                                MaterialPurchase::getArrivedQuantity, MaterialPurchase::getUnitPrice,
                                MaterialPurchase::getRemark, MaterialPurchase::getOrderId,
                                MaterialPurchase::getMaterialId, MaterialPurchase::getMaterialCode,
                                MaterialPurchase::getMaterialName, MaterialPurchase::getSpecifications,
                                MaterialPurchase::getUnit, MaterialPurchase::getSupplierId,
                                MaterialPurchase::getSupplierName, MaterialPurchase::getTenantId,
                                MaterialPurchase::getSourceType)
                        .eq(MaterialPurchase::getId, purchaseId));
        if (existed == null) {
            log.warn("confirmReturnPurchase: 采购记录不存在, purchaseId={}", purchaseId);
            return null;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            log.warn("confirmReturnPurchase: 记录已删除, purchaseId={}", purchaseId);
            return null;
        }
        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if (MaterialConstants.STATUS_CANCELLED.equals(status)) {
            log.warn("confirmReturnPurchase: 采购已取消, purchaseId={}", purchaseId);
            return null;
        }
        return existed;
    }

    private void validateReturnQuantity(MaterialPurchase existed, Integer returnQuantity, String purchaseId) {
        if (returnQuantity == null) {
            throw new IllegalArgumentException("returnQuantity不能为null");
        }
        int rq = returnQuantity;
        if (rq < 0) {
            throw new IllegalArgumentException("returnQuantity不能为负数");
        }
        int purchaseQty = existed.getPurchaseQuantity() == null ? 0 : existed.getPurchaseQuantity().intValue();
        int arrivedQty = existed.getArrivedQuantity() == null ? 0 : existed.getArrivedQuantity();
        int max = arrivedQty > 0 ? arrivedQty : purchaseQty;
        if (max > 10 && rq > max) {
            throw new IllegalArgumentException("回料数量超限: rq=" + rq + ", max=" + max);
        }
    }

    private MaterialPurchase buildReturnPatch(MaterialPurchase existed, String confirmerId, String confirmerName,
            Integer returnQuantity, String who) {
        int rq = returnQuantity;
        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();
        BigDecimal unitPrice = existed.getUnitPrice() == null ? BigDecimal.ZERO : existed.getUnitPrice();
        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(existed.getId());
        patch.setReturnConfirmed(1);
        patch.setReturnQuantity(rq);
        patch.setTotalAmount(unitPrice.multiply(BigDecimal.valueOf(rq)));
        patch.setStatus(rq > 0 ? MaterialConstants.STATUS_AWAITING_CONFIRM : status);
        patch.setReturnConfirmerId(StringUtils.hasText(confirmerId) ? confirmerId.trim() : null);
        patch.setReturnConfirmerName(StringUtils.hasText(confirmerName) ? confirmerName.trim() : who);
        patch.setReturnConfirmTime(LocalDateTime.now());
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());
        return patch;
    }

    private void syncStockOnReturnConfirm(MaterialPurchase existed, Integer returnQuantity, String purchaseId) {
        int rq = returnQuantity;
        int arrivedQty = existed.getArrivedQuantity() == null ? 0 : existed.getArrivedQuantity();
        int delta = rq - arrivedQty;
        if (delta == 0 || isOrderDrivenPurchase(existed)) return;
        try {
            materialStockService.increaseStock(existed, delta);
            log.info("confirmReturnPurchase: 库存同步成功, purchaseId={}, delta={}", purchaseId, delta);
        } catch (Exception e) {
            log.warn("confirmReturnPurchase: 库存同步失败(非致命), purchaseId={}, delta={}, error={}", purchaseId, delta, e.getMessage());
        }
    }

    private boolean persistReturnPatch(String purchaseId, MaterialPurchase patch, MaterialPurchase existed,
            Integer returnQuantity, String confirmerId, String confirmerName, String who) {
        try {
            return this.updateById(patch);
        } catch (Exception e) {
            log.warn("[confirmReturnPurchase] updateById失败(可能schema缺列)，降级LambdaUpdate: {}", e.getMessage());
            return fallbackUpdateReturn(purchaseId, returnQuantity, existed.getUnitPrice(), patch.getStatus(), confirmerId, confirmerName, who, patch.getRemark());
        }
    }

    private boolean fallbackUpdateReturn(String purchaseId, int rq, BigDecimal unitPrice, String newStatus,
            String confirmerId, String confirmerName, String who, String remark) {
        try {
            this.lambdaUpdate()
                    .eq(MaterialPurchase::getId, purchaseId)
                    .set(MaterialPurchase::getReturnConfirmed, 1)
                    .set(MaterialPurchase::getReturnQuantity, rq)
                    .set(MaterialPurchase::getTotalAmount, unitPrice.multiply(BigDecimal.valueOf(rq)))
                    .set(MaterialPurchase::getStatus, newStatus)
                    .set(MaterialPurchase::getReturnConfirmerId, StringUtils.hasText(confirmerId) ? confirmerId.trim() : null)
                    .set(MaterialPurchase::getReturnConfirmerName, StringUtils.hasText(confirmerName) ? confirmerName.trim() : who)
                    .set(MaterialPurchase::getReturnConfirmTime, LocalDateTime.now())
                    .set(MaterialPurchase::getRemark, remark)
                    .set(MaterialPurchase::getUpdateTime, LocalDateTime.now())
                    .update();
            return true;
        } catch (Exception e2) {
            log.error("[confirmReturnPurchase] LambdaUpdate也失败: {}", e2.getMessage());
            return false;
        }
    }

    @Override
    public boolean resetReturnConfirm(String purchaseId, String reason, String operatorId, String operatorName) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = this.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getDeleteFlag,
                                MaterialPurchase::getReturnConfirmed, MaterialPurchase::getArrivedQuantity,
                                MaterialPurchase::getRemark, MaterialPurchase::getOrderId,
                                MaterialPurchase::getMaterialId, MaterialPurchase::getMaterialCode,
                                MaterialPurchase::getMaterialName, MaterialPurchase::getSpecifications,
                                MaterialPurchase::getUnit, MaterialPurchase::getSupplierId,
                                MaterialPurchase::getSupplierName, MaterialPurchase::getTenantId,
                                MaterialPurchase::getSourceType, MaterialPurchase::getReturnQuantity)
                        .eq(MaterialPurchase::getId, purchaseId));
        if (existed == null) {
            return false;
        }
        if (existed.getDeleteFlag() != null && existed.getDeleteFlag() != 0) {
            return false;
        }
        if (existed.getReturnConfirmed() == null || existed.getReturnConfirmed() != 1) {
            return false;
        }

        String who = StringUtils.hasText(operatorName) ? operatorName.trim()
                : (StringUtils.hasText(operatorId) ? operatorId.trim() : "");
        if (!StringUtils.hasText(who)) {
            who = "未命名";
        }

        String prefix = "回料退回:";
        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        String r = StringUtils.hasText(reason) ? reason.trim() : "";
        String add = r.isEmpty() ? (prefix + who + " " + time) : (prefix + who + " " + time + " 原因:" + r);
        remark = remark.isEmpty() ? add : (remark + "；" + add);

        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
        LambdaUpdateWrapper<MaterialPurchase> retConfirmUw = new LambdaUpdateWrapper<>();
        retConfirmUw.eq(MaterialPurchase::getId, purchaseId)
                    .set(MaterialPurchase::getReturnConfirmed, 0)
                    .set(MaterialPurchase::getReturnQuantity, null)
                    .set(MaterialPurchase::getReturnConfirmerId, null)
                    .set(MaterialPurchase::getReturnConfirmerName, null)
                    .set(MaterialPurchase::getReturnConfirmTime, null)
                    .set(MaterialPurchase::getRemark, remark)
                    .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
        String currentStatus = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if (MaterialConstants.STATUS_COMPLETED.equals(currentStatus)
                || MaterialConstants.STATUS_AWAITING_CONFIRM.equals(currentStatus)) {
            retConfirmUw.set(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED);
        }
        boolean ok = this.update(retConfirmUw);

        if (ok && !isOrderDrivenPurchase(existed)) {
            try {
                Integer returnQty = existed.getReturnQuantity();
                Integer arrivedQty = existed.getArrivedQuantity();
                if (returnQty != null && returnQty > 0 && arrivedQty != null) {
                    int delta = returnQty - arrivedQty;
                    if (delta > 0) {
                        materialStockService.decreaseStockForCancelReceive(existed, delta);
                        log.info("resetReturnConfirm 已回退库存: purchaseId={}, delta={}", purchaseId, delta);
                    }
                }
            } catch (Exception e) {
                log.warn("resetReturnConfirm 回退库存失败（不影响主流程）: purchaseId={}, err={}", purchaseId, e.getMessage());
            }
        }

        return ok;
    }

    /**
     * 判断是否为生产订单驱动的采购（sourceType="order" 或 "sample"）
     * 生产订单驱动的采购到货不应写入独立进销存（MaterialStock），
     * 独立进销存只记录独立提前采购的库存。
     */
    private boolean isOrderDrivenPurchase(MaterialPurchase purchase) {
        if (purchase == null) return false;
        String sourceType = purchase.getSourceType();
        return "order".equals(sourceType) || "sample".equals(sourceType);
    }
}
