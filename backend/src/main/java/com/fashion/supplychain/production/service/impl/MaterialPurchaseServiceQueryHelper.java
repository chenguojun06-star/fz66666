package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class MaterialPurchaseServiceQueryHelper {

    private final ProductionOrderService productionOrderService;
    private final MaterialDatabaseService materialDatabaseService;
    private final MaterialPurchaseServiceHelper serviceHelper;

    public IPage<MaterialPurchase> queryPage(Map<String, Object> params,
                                              com.baomidou.mybatisplus.extension.service.IService<MaterialPurchase> purchaseService) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : params;
        long page = ParamUtils.getPageLong(safeParams);
        long pageSize = ParamUtils.getPageSizeLong(safeParams);

        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<MaterialPurchase> wrapper = buildQueryWrapper(safeParams, tenantId);
        IPage<MaterialPurchase> pageResult = purchaseService.page(
                new Page<>(page, pageSize), wrapper);

        List<MaterialPurchase> records = pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            repairRecords(records);
            fillOrderFactoryInfo(records);
            fillMaterialDatabaseAttributes(records);
        }

        return pageResult;
    }

    LambdaQueryWrapper<MaterialPurchase> buildQueryWrapper(Map<String, Object> safeParams, Long tenantId) {
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0);

        String keyword = (String) safeParams.getOrDefault("keyword", "");
        String orderNo = (String) safeParams.getOrDefault("orderNo", "");
        String styleNo = (String) safeParams.getOrDefault("styleNo", "");
        String materialName = (String) safeParams.getOrDefault("materialName", "");
        String materialCode = (String) safeParams.getOrDefault("materialCode", "");
        String status = (String) safeParams.getOrDefault("status", "");
        String materialType = (String) safeParams.getOrDefault("materialType", "");
        String factoryType = (String) safeParams.getOrDefault("factoryType", "");
        String factoryName = (String) safeParams.getOrDefault("factoryName", "");

        applyKeywordSearch(wrapper, keyword, orderNo, styleNo, materialName, materialCode, tenantId);
        applyStatusFilter(wrapper, status);
        applyMaterialTypeFilter(wrapper, materialType);
        applyFactoryFilters(wrapper, factoryType, factoryName, tenantId);
        applyFactoryAccountFilter(wrapper, safeParams);

        wrapper.orderByDesc(MaterialPurchase::getCreateTime);
        return wrapper;
    }

    void repairRecords(List<MaterialPurchase> records) {
        for (MaterialPurchase record : records) {
            if (record == null || !StringUtils.hasText(record.getId())) {
                continue;
            }
            serviceHelper.ensureSnapshot(record);

            if (record.getReturnConfirmed() != null && record.getReturnConfirmed() == 1) {
                Integer beforeArrivedQuantity = record.getArrivedQuantity();
                int arrived = beforeArrivedQuantity == null ? 0 : beforeArrivedQuantity;
                int rq = record.getReturnQuantity() == null ? 0 : record.getReturnQuantity();
                if (arrived != rq) {
                    record.setArrivedQuantity(rq);
                    if (record.getUnitPrice() != null) {
                        record.setTotalAmount(record.getUnitPrice().multiply(BigDecimal.valueOf(rq)));
                    }
                    int pq = record.getPurchaseQuantity() == null ? 0 : record.getPurchaseQuantity().intValue();
                    String s = record.getStatus() == null ? "" : record.getStatus().trim();
                    record.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(s, rq, pq));
                }
            }

            MaterialPurchaseHelper.repairReceiverFromRemark(record);
        }
    }

    void fillOrderFactoryInfo(List<MaterialPurchase> records) {
        List<String> orderIds = records.stream()
                .map(MaterialPurchase::getOrderId)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        List<ProductionOrder> factoryOrders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .in(ProductionOrder::getId, orderIds)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .select(ProductionOrder::getId, ProductionOrder::getFactoryName, ProductionOrder::getFactoryType)
        );
        Map<String, ProductionOrder> factoryOrderMap = factoryOrders.stream()
                .filter(o -> o != null && StringUtils.hasText(o.getId()))
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

    void fillMaterialDatabaseAttributes(List<MaterialPurchase> records) {
        List<String> matCodes = records.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (matCodes.isEmpty()) {
            return;
        }

        Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                new LambdaQueryWrapper<MaterialDatabase>()
                        .in(MaterialDatabase::getMaterialCode, matCodes)
                        .select(MaterialDatabase::getId, MaterialDatabase::getMaterialCode,
                                MaterialDatabase::getFabricWidth, MaterialDatabase::getFabricWeight,
                                MaterialDatabase::getFabricComposition, MaterialDatabase::getSupplierName,
                                MaterialDatabase::getUnitPrice, MaterialDatabase::getColor,
                                MaterialDatabase::getSpecifications))
                .stream()
                .filter(d -> d != null && StringUtils.hasText(d.getMaterialCode()))
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

    private void applyKeywordSearch(LambdaQueryWrapper<MaterialPurchase> wrapper, String keyword,
                                     String orderNo, String styleNo, String materialName,
                                     String materialCode, Long tenantId) {
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .and(w -> w.like(ProductionOrder::getOrderNo, kw)
                                    .or().like(ProductionOrder::getStyleNo, kw)
                                    .or().like(ProductionOrder::getStyleName, kw))
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                    .collect(Collectors.toList());

            wrapper.and(w -> {
                w.like(MaterialPurchase::getMaterialName, kw)
                        .or().like(MaterialPurchase::getMaterialCode, kw)
                        .or().like(MaterialPurchase::getSupplierName, kw);
                if (!matchedOrderIds.isEmpty()) {
                    w.or().in(MaterialPurchase::getOrderId, matchedOrderIds);
                }
            });
        } else {
            if (StringUtils.hasText(orderNo)) {
                List<String> onOrderIds = productionOrderService.list(
                        new LambdaQueryWrapper<ProductionOrder>()
                                .select(ProductionOrder::getId)
                                .eq(ProductionOrder::getTenantId, tenantId)
                                .like(ProductionOrder::getOrderNo, orderNo.trim())
                                .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                                .ne(ProductionOrder::getStatus, "scrapped"))
                        .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                        .collect(Collectors.toList());
                if (!onOrderIds.isEmpty()) {
                    wrapper.in(MaterialPurchase::getOrderId, onOrderIds);
                } else {
                    wrapper.apply("1=0");
                }
            }
            if (StringUtils.hasText(styleNo)) {
                List<String> snOrderIds = productionOrderService.list(
                        new LambdaQueryWrapper<ProductionOrder>()
                                .select(ProductionOrder::getId)
                                .eq(ProductionOrder::getTenantId, tenantId)
                                .like(ProductionOrder::getStyleNo, styleNo.trim())
                                .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                                .ne(ProductionOrder::getStatus, "scrapped"))
                        .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                        .collect(Collectors.toList());
                if (!snOrderIds.isEmpty()) {
                    wrapper.in(MaterialPurchase::getOrderId, snOrderIds);
                } else {
                    wrapper.apply("1=0");
                }
            }
            if (StringUtils.hasText(materialName)) {
                wrapper.like(MaterialPurchase::getMaterialName, materialName.trim());
            }
            if (StringUtils.hasText(materialCode)) {
                wrapper.like(MaterialPurchase::getMaterialCode, materialCode.trim());
            }
        }
    }

    private void applyStatusFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String status) {
        if (StringUtils.hasText(status)) {
            if ("pending_and_received".equalsIgnoreCase(status)) {
                wrapper.and(w -> w.eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                        .or().eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED)
                        .or().eq(MaterialPurchase::getStatus, "PENDING")
                        .or().eq(MaterialPurchase::getStatus, "RECEIVED"));
            } else {
                wrapper.eq(MaterialPurchase::getStatus, status.trim());
            }
        }
    }

    private void applyMaterialTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String materialType) {
        if (!StringUtils.hasText(materialType)) {
            return;
        }
        String normalizedType = MaterialPurchaseHelper.normalizeMaterialType(materialType);
        if (MaterialConstants.TYPE_FABRIC.equals(normalizedType)) {
            wrapper.and(w -> w.eq(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC)
                    .or().likeRight(MaterialPurchase::getMaterialType, "面")
                    .or().likeRight(MaterialPurchase::getMaterialType, "fabric"));
        } else if (MaterialConstants.TYPE_ACCESSORY.equals(normalizedType)) {
            wrapper.and(w -> w.eq(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY)
                    .or().likeRight(MaterialPurchase::getMaterialType, "辅")
                    .or().likeRight(MaterialPurchase::getMaterialType, "accessory"));
        } else {
            wrapper.eq(MaterialPurchase::getMaterialType, materialType.trim());
        }
    }

    private void applyFactoryFilters(LambdaQueryWrapper<MaterialPurchase> wrapper, String factoryType,
                                      String factoryName, Long tenantId) {
        if (StringUtils.hasText(factoryType)) {
            List<String> ftOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getFactoryType, factoryType.trim().toUpperCase())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            wrapper.and(w -> {
                w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "");
                if (!ftOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, ftOrderIds);
            });
        }
        if (StringUtils.hasText(factoryName)) {
            List<String> fnOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .like(ProductionOrder::getFactoryName, factoryName.trim())
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
                            .ne(ProductionOrder::getStatus, "scrapped"))
                    .stream().map(ProductionOrder::getId).filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            wrapper.and(w -> {
                w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "");
                if (!fnOrderIds.isEmpty()) w.or().in(MaterialPurchase::getOrderId, fnOrderIds);
            });
        }
    }

    @SuppressWarnings("unchecked")
    private void applyFactoryAccountFilter(LambdaQueryWrapper<MaterialPurchase> wrapper,
                                            Map<String, Object> safeParams) {
        List<String> factoryOrderIds = (List<String>) safeParams.get("_factoryOrderIds");
        if (factoryOrderIds != null && !factoryOrderIds.isEmpty()) {
            wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
        }
    }
}
