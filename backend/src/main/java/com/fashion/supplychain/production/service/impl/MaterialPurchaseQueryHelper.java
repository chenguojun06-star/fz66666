package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component("materialPurchaseQueryHelperImpl")
class MaterialPurchaseQueryHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialPurchaseServiceHelper serviceHelper;

    LambdaQueryWrapper<MaterialPurchase> buildQueryWrapper(Map<String, Object> safeParams, Long tenantId) {
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

    void repairRecords(List<MaterialPurchase> records) {
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

    void enrichFactoryInfo(List<MaterialPurchase> records) {
        List<String> orderIds = records.stream()
                .map(MaterialPurchase::getOrderId).filter(StringUtils::hasText).distinct().collect(Collectors.toList());
        if (orderIds.isEmpty()) return;
        Map<String, ProductionOrder> factoryOrderMap = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getId, orderIds)
                        .eq(ProductionOrder::getDeleteFlag, 0)
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

    void enrichFromMaterialDatabase(List<MaterialPurchase> records) {
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
}
