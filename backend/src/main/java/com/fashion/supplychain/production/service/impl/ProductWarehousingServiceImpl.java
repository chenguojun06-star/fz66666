package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.util.StringUtils;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import lombok.extern.slf4j.Slf4j;
import java.util.List;
import com.fashion.supplychain.websocket.service.WebSocketService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;

import static com.fashion.supplychain.production.service.impl.ProductWarehousingHelper.*;

@Service
@Slf4j
public class ProductWarehousingServiceImpl extends ServiceImpl<ProductWarehousingMapper, ProductWarehousing>
        implements ProductWarehousingService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductWarehousingHelper helper;

    @Autowired
    private WebSocketService webSocketService;

    @Override
    public String warehousingQuantityRuleViolationMessage(String orderId, Integer requestWarehousingQuantity,
            String excludeWarehousingId) {
        return helper.warehousingQuantityRuleViolationMessage(orderId, requestWarehousingQuantity,
                excludeWarehousingId);
    }

    @Override
    public int sumQualifiedByOrderId(String orderId) {
        return helper.sumQualifiedByOrderId(orderId);
    }

    @Override
    public IPage<ProductWarehousing> queryPage(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new java.util.HashMap<>() : params;
        Integer page = ParamUtils.getPage(safeParams);
        Integer pageSize = ParamUtils.getPageSize(safeParams);
        Page<ProductWarehousing> pageInfo = new Page<>(page, pageSize);

        String warehousingNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "warehousingNo"));
        String orderId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderId"));
        String orderNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "orderNo"));
        String styleNo = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "styleNo"));
        String warehouse = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "warehouse"));
        String qualityStatus = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "qualityStatus"));
        String cuttingBundleId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "cuttingBundleId"));
        String cuttingBundleQrCode = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "cuttingBundleQrCode"));
        String parentOrgUnitId = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "parentOrgUnitId"));
        String factoryType = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "factoryType"));

        List<String> keywordMatchedOrderIds = resolveKeywordMatchedOrderIds(warehousingNo);
        LambdaQueryWrapper<ProductWarehousing> wrapper = buildWarehousingQueryWrapper(
                orderId, orderNo, styleNo, warehouse, qualityStatus, cuttingBundleId, cuttingBundleQrCode, warehousingNo, keywordMatchedOrderIds);
        List<String> scopedOrderIds = resolveScopedOrderIds(safeParams, parentOrgUnitId, factoryType);

        if (scopedOrderIds != null) {
            if (scopedOrderIds.isEmpty()) return new Page<>(page, pageSize, 0);
            wrapper.in(ProductWarehousing::getOrderId, scopedOrderIds);
        }
        return baseMapper.selectPage(pageInfo, wrapper);
    }

    private List<String> resolveKeywordMatchedOrderIds(String warehousingNo) {
        if (!StringUtils.hasText(warehousingNo)) return java.util.Collections.emptyList();
        return productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId)
                    .and(w -> w.like(ProductionOrder::getOrderNo, warehousingNo)
                        .or().like(ProductionOrder::getStyleNo, warehousingNo)
                        .or().like(ProductionOrder::getFactoryName, warehousingNo))
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0)))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).toList();
    }

    private LambdaQueryWrapper<ProductWarehousing> buildWarehousingQueryWrapper(
            String orderId, String orderNo, String styleNo, String warehouse, String qualityStatus,
            String cuttingBundleId, String cuttingBundleQrCode, String warehousingNo, List<String> keywordMatchedOrderIds) {
        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .select(
                    ProductWarehousing::getId, ProductWarehousing::getWarehousingNo,
                    ProductWarehousing::getOrderId, ProductWarehousing::getOrderNo,
                    ProductWarehousing::getStyleId, ProductWarehousing::getStyleNo, ProductWarehousing::getStyleName,
                    ProductWarehousing::getWarehousingQuantity, ProductWarehousing::getQualifiedQuantity,
                    ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getWarehousingType,
                    ProductWarehousing::getWarehouse, ProductWarehousing::getWarehousingStartTime,
                    ProductWarehousing::getWarehousingEndTime, ProductWarehousing::getWarehousingOperatorId,
                    ProductWarehousing::getWarehousingOperatorName, ProductWarehousing::getQualityStatus,
                    ProductWarehousing::getCuttingBundleId, ProductWarehousing::getCuttingBundleNo,
                    ProductWarehousing::getCuttingBundleQrCode, ProductWarehousing::getUnqualifiedImageUrls,
                    ProductWarehousing::getDefectCategory, ProductWarehousing::getDefectRemark,
                    ProductWarehousing::getRepairRemark, ProductWarehousing::getReceiverId,
                    ProductWarehousing::getReceiverName, ProductWarehousing::getReceivedTime,
                    ProductWarehousing::getInspectionStatus, ProductWarehousing::getCreateTime,
                    ProductWarehousing::getUpdateTime, ProductWarehousing::getDeleteFlag,
                    ProductWarehousing::getQualityOperatorId, ProductWarehousing::getQualityOperatorName,
                    ProductWarehousing::getTenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .eq(StringUtils.hasText(orderId), ProductWarehousing::getOrderId, orderId)
                .like(StringUtils.hasText(orderNo), ProductWarehousing::getOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), ProductWarehousing::getStyleNo, styleNo)
                .eq(StringUtils.hasText(warehouse), ProductWarehousing::getWarehouse, warehouse)
                .eq(StringUtils.hasText(qualityStatus), ProductWarehousing::getQualityStatus, qualityStatus)
                .eq(StringUtils.hasText(cuttingBundleId), ProductWarehousing::getCuttingBundleId, cuttingBundleId)
                .eq(StringUtils.hasText(cuttingBundleQrCode), ProductWarehousing::getCuttingBundleQrCode, cuttingBundleQrCode)
                .orderByDesc(ProductWarehousing::getCreateTime);
        if (StringUtils.hasText(warehousingNo)) {
            wrapper.and(w -> {
                w.like(ProductWarehousing::getWarehousingNo, warehousingNo);
                if (!keywordMatchedOrderIds.isEmpty()) {
                    w.or().in(ProductWarehousing::getOrderId, keywordMatchedOrderIds);
                }
            });
        }
        return wrapper;
    }

    private List<String> resolveScopedOrderIds(Map<String, Object> safeParams, String parentOrgUnitId, String factoryType) {
        @SuppressWarnings("unchecked")
        List<String> factoryOrderIds = (List<String>) safeParams.get("_factoryOrderIds");
        List<String> scopedOrderIds = factoryOrderIds != null ? new java.util.ArrayList<>(factoryOrderIds) : null;
        if (StringUtils.hasText(parentOrgUnitId) || StringUtils.hasText(factoryType)) {
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(StringUtils.hasText(parentOrgUnitId), ProductionOrder::getParentOrgUnitId, parentOrgUnitId)
                            .eq(StringUtils.hasText(factoryType), ProductionOrder::getFactoryType, factoryType)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).filter(StringUtils::hasText).toList();
            if (scopedOrderIds == null) {
                scopedOrderIds = new java.util.ArrayList<>(matchedOrderIds);
            } else {
                scopedOrderIds.retainAll(matchedOrderIds);
            }
        }
        return scopedOrderIds;
    }

    // ==================== 入库保存核心逻辑 ====================

    private boolean saveWarehousingAndUpdateOrderInternal(ProductWarehousing pw, boolean skipRangeCheck) {
        LocalDateTime now = LocalDateTime.now();

        ProductionOrder order = validateOrderForSave(pw);
        resolveWarehousingNo(pw, order);
        String computedQualityStatus = validateAndNormalizeQuantities(pw);
        String repairRemark = helper.trimToNull(pw.getRepairRemark());

        BundleResolveResult bundleResult = resolveBundleAndValidateRepair(pw, order, computedQualityStatus, repairRemark);
        CuttingBundle bundle = bundleResult.bundle;
        boolean bundleIsBlocked = bundleResult.blocked;
        repairRemark = bundleResult.repairRemark;

        validateQuantityRange(order, pw.getWarehousingQuantity(), bundleIsBlocked, computedQualityStatus, repairRemark, skipRangeCheck);
        fillDefaultFields(pw, order, now);

        boolean ok = saveWithIdempotency(pw);
        if (ok) {
            executePostSaveSideEffects(pw, order, bundle, computedQualityStatus, repairRemark, now);
        }
        return ok;
    }

    private ProductionOrder validateOrderForSave(ProductWarehousing pw) {
        if (!StringUtils.hasText(pw.getOrderId())) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, pw.getOrderId())
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已终态(" + st + ")，已停止入库");
        }
        return order;
    }

    private void resolveWarehousingNo(ProductWarehousing pw, ProductionOrder order) {
        String existingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (StringUtils.hasText(existingNo)) {
            pw.setWarehousingNo(existingNo);
        }
    }

    private String validateAndNormalizeQuantities(ProductWarehousing pw) {
        int qualified = pw.getQualifiedQuantity() == null ? 0 : pw.getQualifiedQuantity();
        int unqualified = pw.getUnqualifiedQuantity() == null ? 0 : pw.getUnqualifiedQuantity();
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        int warehousingQty = pw.getWarehousingQuantity() == null ? (qualified + unqualified) : pw.getWarehousingQuantity();
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        pw.setWarehousingQuantity(warehousingQty);
        pw.setQualifiedQuantity(qualified);
        pw.setUnqualifiedQuantity(unqualified);
        return unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
    }

    private record BundleResolveResult(CuttingBundle bundle, boolean blocked, String repairRemark) {}

    private BundleResolveResult resolveBundleAndValidateRepair(ProductWarehousing pw, ProductionOrder order,
            String computedQualityStatus, String repairRemark) {
        CuttingBundle bundle = null;
        boolean bundleIsBlocked = false;
        String bundleId = StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId().trim() : null;
        String bundleQr = StringUtils.hasText(pw.getCuttingBundleQrCode()) ? pw.getCuttingBundleQrCode().trim() : null;

        if (!StringUtils.hasText(bundleId) && !StringUtils.hasText(bundleQr)) {
            return new BundleResolveResult(null, false, repairRemark);
        }

        if (StringUtils.hasText(bundleId)) {
            bundle = cuttingBundleService.getById(bundleId);
        }
        if (bundle == null && StringUtils.hasText(bundleQr)) {
            bundle = cuttingBundleService.getByQrCode(bundleQr);
        }
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的菲号");
        }
        if (StringUtils.hasText(bundle.getProductionOrderId())
                && !order.getId().trim().equals(bundle.getProductionOrderId().trim())) {
            throw new IllegalArgumentException("菲号与订单不匹配");
        }

        bundleIsBlocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
        if (bundleIsBlocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
        }
        if (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && !StringUtils.hasText(repairRemark)) {
            repairRemark = "返修检验合格";
            pw.setRepairRemark(repairRemark);
        }
        if (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && StringUtils.hasText(repairRemark)) {
            validateRepairReQcQuantity(order.getId(), bundle.getId(), pw.getWarehousingQuantity(), null);
        }

        pw.setCuttingBundleId(bundle.getId());
        pw.setCuttingBundleNo(bundle.getBundleNo());
        pw.setCuttingBundleQrCode(bundle.getQrCode());
        helper.ensureBundleNotAlreadyQualifiedWarehoused(order.getId(), bundle.getId(), null);

        return new BundleResolveResult(bundle, bundleIsBlocked, repairRemark);
    }

    private void validateRepairReQcQuantity(String orderId, String bundleId, int warehousingQty, String excludeId) {
        int[] bd = helper.calcRepairBreakdown(orderId, bundleId, excludeId);
        int remaining = Math.max(0, bd[1] - bd[2]);
        int repairPool = bd[0];
        int availableQty = Math.max(remaining, repairPool);
        if (availableQty <= 0) {
            throw new IllegalStateException("该菲号无次品需要重新质检");
        }
        if (warehousingQty > availableQty) {
            throw new IllegalStateException("该菲号可返修入库数量为" + availableQty + "，不能超过可质检数量");
        }
    }

    private void validateQuantityRange(ProductionOrder order, int warehousingQty,
            boolean bundleIsBlocked, String computedQualityStatus, String repairRemark, boolean skipRangeCheck) {
        if (skipRangeCheck) return;
        boolean isRepairReQc = (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus))
                || StringUtils.hasText(repairRemark);
        if (!isRepairReQc) {
            String msg = helper.warehousingQuantityRuleViolationMessage(order.getId(), warehousingQty, null);
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }
    }

    private void fillDefaultFields(ProductWarehousing pw, ProductionOrder order, LocalDateTime now) {
        if (!StringUtils.hasText(pw.getOrderNo())) pw.setOrderNo(order.getOrderNo());
        if (!StringUtils.hasText(pw.getStyleId())) pw.setStyleId(order.getStyleId());
        if (!StringUtils.hasText(pw.getStyleNo())) pw.setStyleNo(order.getStyleNo());
        if (!StringUtils.hasText(pw.getStyleName())) pw.setStyleName(order.getStyleName());
        if (!StringUtils.hasText(pw.getWarehousingNo())) pw.setWarehousingNo(helper.buildWarehousingNo(now));
        if (!StringUtils.hasText(pw.getWarehousingType())) pw.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
        if (pw.getWarehousingStartTime() == null) pw.setWarehousingStartTime(now);
        if (pw.getWarehousingEndTime() == null) pw.setWarehousingEndTime(now);
        if (!StringUtils.hasText(pw.getWarehousingOperatorId()) && StringUtils.hasText(pw.getReceiverId())) {
            pw.setWarehousingOperatorId(pw.getReceiverId());
        }
        if (!StringUtils.hasText(pw.getWarehousingOperatorName()) && StringUtils.hasText(pw.getReceiverName())) {
            pw.setWarehousingOperatorName(pw.getReceiverName());
        }
        pw.setCreateTime(now);
        pw.setUpdateTime(now);
        pw.setDeleteFlag(0);
    }

    private boolean saveWithIdempotency(ProductWarehousing pw) {
        try {
            return this.save(pw);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            log.info("入库记录重复（幂等，视为成功）: orderId={}, bundleId={}",
                    pw.getOrderId(), pw.getCuttingBundleId(), dke);
            return true;
        }
    }

    private void executePostSaveSideEffects(ProductWarehousing pw, ProductionOrder order,
            CuttingBundle bundle, String computedQualityStatus, String repairRemark, LocalDateTime now) {
        updateBundleAfterSave(bundle, pw, computedQualityStatus, repairRemark, now);
        syncOrderCompletedQuantity(pw.getOrderId());
        upsertScanRecords(pw, order, bundle, now);
        updateSkuStockAfterSave(pw, order, bundle);
        broadcastWarehousingNotification(pw, order);
    }

    private void updateBundleAfterSave(CuttingBundle bundle, ProductWarehousing pw,
            String computedQualityStatus, String repairRemark, LocalDateTime now) {
        if (bundle == null || !StringUtils.hasText(bundle.getId())) return;
        try {
            helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
        } catch (Exception e) {
            log.warn("更新菲号状态失败（不阻断入库）: bundleId={}, orderId={}", bundle.getId(), pw.getOrderId(), e);
        }
        if (helper.isBundleBlockedForWarehousing(bundle.getStatus()) && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            try {
                helper.resolveDefectRecordsAfterReQc(pw.getOrderId(), bundle.getId(), pw.getId());
            } catch (Exception e) {
                log.warn("清理旧次品记录失败（不阻断）: orderId={}, bundleId={}", pw.getOrderId(), bundle.getId(), e);
            }
        }
    }

    private void syncOrderCompletedQuantity(String orderId) {
        try {
            int qualifiedSum = helper.sumQualifiedByOrderId(orderId);
            ProductionOrder patch = new ProductionOrder();
            patch.setId(orderId);
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(patch);
        } catch (Exception e) {
            log.warn("更新订单完成数量失败（不阻断入库）: orderId={}", orderId, e);
        }
    }

    private void upsertScanRecords(ProductWarehousing pw, ProductionOrder order, CuttingBundle bundle, LocalDateTime now) {
        try {
            helper.upsertWarehousingStageScanRecord(pw, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehousing stage scan record: warehousingId={}, orderId={}",
                    pw == null ? null : pw.getId(), pw == null ? null : pw.getOrderId(), e);
        }
        try {
            helper.upsertWarehouseScanRecord(pw, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehouse scan record: warehousingId={}, orderId={}",
                    pw == null ? null : pw.getId(), pw == null ? null : pw.getOrderId(), e);
        }
    }

    private void updateSkuStockAfterSave(ProductWarehousing pw, ProductionOrder order, CuttingBundle bundle) {
        if (pw.getQualifiedQuantity() != null && pw.getQualifiedQuantity() > 0) {
            try {
                helper.updateSkuStock(pw, order, bundle, pw.getQualifiedQuantity());
            } catch (Exception e) {
                log.warn("更新SKU库存失败（不阻断入库）: orderId={}", pw.getOrderId(), e);
            }
        }
    }

    private void broadcastWarehousingNotification(ProductWarehousing pw, ProductionOrder order) {
        try {
            String orderNo = pw.getOrderNo() != null ? pw.getOrderNo() : order.getOrderNo();
            String warehouse = pw.getWarehouse() != null ? pw.getWarehouse() : "";
            int qty = pw.getQualifiedQuantity() != null ? pw.getQualifiedQuantity() : 0;
            String operatorId = pw.getQualityOperatorId() != null ? pw.getQualityOperatorId() : "";
            webSocketService.notifyWarehouseIn(operatorId, orderNo, qty, warehouse);
            webSocketService.notifyOrderProgressChanged(operatorId, orderNo, 0, "入库");
            webSocketService.notifyDataChanged(operatorId, "ProductWarehousing", pw.getId(), "create");
        } catch (Exception e) {
            log.warn("入库WebSocket广播失败（不阻断入库）: orderId={}", pw.getOrderId(), e);
        }
    }

    // ==================== 入库更新核心逻辑 ====================

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public boolean saveWarehousingAndUpdateOrder(ProductWarehousing productWarehousing) {
        return saveWarehousingAndUpdateOrderInternal(productWarehousing, false);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean saveBatchWarehousingAndUpdateOrder(List<ProductWarehousing> list) {
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        String orderId = extractOrderIdFromList(list);
        ProductionOrder order = validateOrderForSaveById(orderId);

        LocalDateTime now = LocalDateTime.now();
        String warehousingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (!StringUtils.hasText(warehousingNo)) {
            warehousingNo = helper.buildWarehousingNo(now);
        }

        for (ProductWarehousing w : list) {
            if (w == null) continue;
            w.setOrderId(order.getId());
            w.setWarehousingNo(warehousingNo);
            if (!StringUtils.hasText(w.getWarehousingType())) w.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
            if (!StringUtils.hasText(w.getQualityStatus())) w.setQualityStatus(STATUS_QUALIFIED);
        }

        for (ProductWarehousing w : list) {
            if (w == null) continue;
            boolean ok = saveWarehousingAndUpdateOrderInternal(w, true);
            if (!ok) throw new IllegalStateException("批量入库失败");
        }
        return true;
    }

    private String extractOrderIdFromList(List<ProductWarehousing> list) {
        for (ProductWarehousing w : list) {
            if (w != null && StringUtils.hasText(w.getOrderId())) {
                return w.getOrderId().trim();
            }
        }
        throw new IllegalArgumentException("订单ID不能为空");
    }

    private ProductionOrder validateOrderForSaveById(String orderId) {
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
        return order;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateWarehousingAndUpdateOrder(ProductWarehousing pw) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        ProductWarehousing oldW = this.lambdaQuery()
                .eq(ProductWarehousing::getId, pw.getId())
                .eq(ProductWarehousing::getTenantId, tenantId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .one();
        if (oldW == null) return false;

        Boolean conversion = tryQualityScanConversion(oldW, pw);
        if (conversion != null) return conversion;

        validateOrderNotTerminal(oldW.getOrderId());

        LocalDateTime now = LocalDateTime.now();
        pw.setUpdateTime(now);
        String computedQualityStatus = validateAndNormalizeUpdateQuantities(pw, oldW);
        int qualified = pw.getQualifiedQuantity();
        int unqualified = pw.getUnqualifiedQuantity();
        int warehousingQty = pw.getWarehousingQuantity();

        validateUpdateQuantityRange(oldW, warehousingQty);
        validateBundleNotAlreadyWarehoused(pw, oldW);

        boolean ok = this.updateById(pw);
        if (!ok) return false;

        syncOrderCompletedQuantity(oldW.getOrderId());
        CuttingBundle bundle = loadBundleForUpdate(pw, oldW);
        handleUpdateSkuStockDiff(pw, oldW, bundle);
        handleUpdateBundleSideEffects(pw, oldW, bundle, computedQualityStatus, now);
        upsertUpdateScanRecords(pw, oldW, bundle, computedQualityStatus, qualified, warehousingQty, unqualified, now);
        return true;
    }

    private Boolean tryQualityScanConversion(ProductWarehousing oldW, ProductWarehousing pw) {
        String oldType = oldW.getWarehousingType() == null ? "" : oldW.getWarehousingType().trim();
        boolean isQualified = STATUS_QUALIFIED.equalsIgnoreCase(
                oldW.getQualityStatus() == null ? "" : oldW.getQualityStatus().trim());

        if ("quality_scan".equals(oldType) && isQualified) {
            return handleQualityScanToManualConversion(oldW, pw);
        }
        if ("quality_scan_scrap".equals(oldType) || ("quality_scan".equals(oldType) && !isQualified)) {
            throw new IllegalStateException("该记录是手机端质检记录（" + oldType + "），不能直接转为入库。请通过手机端扫码入库。");
        }
        return null;
    }

    private boolean handleQualityScanToManualConversion(ProductWarehousing oldW, ProductWarehousing pw) {
        String warehouse = pw.getWarehouse();
        if (!StringUtils.hasText(warehouse)) {
            throw new IllegalArgumentException("请指定仓库");
        }
        long existingManual = this.count(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oldW.getOrderId())
                .eq(ProductWarehousing::getCuttingBundleId, oldW.getCuttingBundleId())
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .in(ProductWarehousing::getWarehousingType, "manual", "scan")
                .eq(ProductWarehousing::getQualityStatus, STATUS_QUALIFIED));
        if (existingManual > 0) {
            throw new IllegalStateException("该菲号已完成入库，不能重复入库");
        }
        ProductWarehousing newRecord = buildManualRecordFromQualityScan(oldW, pw);
        return this.saveWarehousingAndUpdateOrder(newRecord);
    }

    private ProductWarehousing buildManualRecordFromQualityScan(ProductWarehousing oldW, ProductWarehousing pw) {
        ProductWarehousing nr = new ProductWarehousing();
        nr.setOrderId(oldW.getOrderId());
        nr.setOrderNo(oldW.getOrderNo());
        nr.setStyleId(oldW.getStyleId());
        nr.setStyleNo(oldW.getStyleNo());
        nr.setStyleName(oldW.getStyleName());
        nr.setWarehousingType("manual");
        nr.setWarehouse(pw.getWarehouse());
        int qualifiedQty = oldW.getQualifiedQuantity() == null ? 0 : oldW.getQualifiedQuantity();
        nr.setWarehousingQuantity(qualifiedQty);
        nr.setQualifiedQuantity(qualifiedQty);
        nr.setUnqualifiedQuantity(0);
        nr.setQualityStatus(STATUS_QUALIFIED);
        nr.setCuttingBundleId(oldW.getCuttingBundleId());
        nr.setCuttingBundleNo(oldW.getCuttingBundleNo());
        nr.setCuttingBundleQrCode(oldW.getCuttingBundleQrCode());
        nr.setWarehousingOperatorId(pw.getWarehousingOperatorId());
        nr.setWarehousingOperatorName(pw.getWarehousingOperatorName());
        nr.setQualityOperatorId(oldW.getQualityOperatorId());
        nr.setQualityOperatorName(oldW.getQualityOperatorName());
        nr.setReceiverId(pw.getReceiverId());
        nr.setReceiverName(pw.getReceiverName());
        return nr;
    }

    private void validateOrderNotTerminal(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        String st = order == null ? "" : (order.getStatus() == null ? "" : order.getStatus().trim());
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
    }

    private String validateAndNormalizeUpdateQuantities(ProductWarehousing pw, ProductWarehousing oldW) {
        Integer uq = pw.getUnqualifiedQuantity() != null ? pw.getUnqualifiedQuantity() : oldW.getUnqualifiedQuantity();
        Integer qq = pw.getQualifiedQuantity() != null ? pw.getQualifiedQuantity() : oldW.getQualifiedQuantity();
        Integer wq = pw.getWarehousingQuantity() != null ? pw.getWarehousingQuantity() : oldW.getWarehousingQuantity();
        int unqualified = uq == null ? 0 : uq;
        int qualified = qq == null ? 0 : qq;
        int warehousingQty = wq == null ? (qualified + unqualified) : wq;
        if (qualified < 0 || unqualified < 0) throw new IllegalArgumentException("数量不能为负数");
        if (warehousingQty <= 0) throw new IllegalArgumentException("入库数量必须大于0");
        if (qualified + unqualified != warehousingQty) throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        pw.setWarehousingQuantity(warehousingQty);
        pw.setQualifiedQuantity(qualified);
        pw.setUnqualifiedQuantity(unqualified);
        return unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
    }

    private void validateUpdateQuantityRange(ProductWarehousing oldW, int warehousingQty) {
        if (!StringUtils.hasText(oldW.getOrderId())) return;
        String msg = helper.warehousingQuantityRuleViolationMessage(oldW.getOrderId(), warehousingQty, oldW.getId());
        if (StringUtils.hasText(msg)) throw new IllegalStateException(msg);
    }

    private void validateBundleNotAlreadyWarehoused(ProductWarehousing pw, ProductWarehousing oldW) {
        if (StringUtils.hasText(pw.getCuttingBundleId())
                && (oldW.getCuttingBundleId() == null || !pw.getCuttingBundleId().trim().equals(oldW.getCuttingBundleId().trim()))) {
            String oid = StringUtils.hasText(oldW.getOrderId()) ? oldW.getOrderId().trim() : null;
            helper.ensureBundleNotAlreadyQualifiedWarehoused(oid, pw.getCuttingBundleId(), oldW.getId());
        }
    }

    private CuttingBundle loadBundleForUpdate(ProductWarehousing pw, ProductWarehousing oldW) {
        String bid = StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId().trim()
                : (StringUtils.hasText(oldW.getCuttingBundleId()) ? oldW.getCuttingBundleId().trim() : null);
        if (!StringUtils.hasText(bid)) return null;
        try {
            return cuttingBundleService.getById(bid);
        } catch (Exception e) {
            log.warn("Failed to load cutting bundle when updating warehousing: cuttingBundleId={}", bid, e);
            return null;
        }
    }

    private void handleUpdateSkuStockDiff(ProductWarehousing pw, ProductWarehousing oldW, CuttingBundle bundle) {
        int oldQ = oldW.getQualifiedQuantity() == null ? 0 : oldW.getQualifiedQuantity();
        int newQ = pw.getQualifiedQuantity();
        int diff = newQ - oldQ;
        if (diff == 0) return;
        ProductionOrder order = null;
        if (StringUtils.hasText(oldW.getOrderId())) {
            Long tenantId = UserContext.tenantId();
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, oldW.getOrderId())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
        }
        helper.updateSkuStock(pw, order, bundle, diff);
    }

    private void handleUpdateBundleSideEffects(ProductWarehousing pw, ProductWarehousing oldW,
            CuttingBundle bundle, String computedQualityStatus, LocalDateTime now) {
        if (bundle == null || !StringUtils.hasText(bundle.getId())) return;

        String repairRemark = helper.trimToNull(pw.getRepairRemark());
        if (repairRemark == null) repairRemark = helper.trimToNull(oldW.getRepairRemark());

        boolean blocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
        if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
        }
        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && !StringUtils.hasText(repairRemark)) {
            repairRemark = "返修检验合格";
            pw.setRepairRemark(repairRemark);
        }
        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && StringUtils.hasText(repairRemark)) {
            String oid = StringUtils.hasText(oldW.getOrderId()) ? oldW.getOrderId().trim() : null;
            validateRepairReQcQuantity(oid, bundle.getId(), pw.getWarehousingQuantity(), oldW.getId());
        }
        helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);

        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            try {
                helper.resolveDefectRecordsAfterReQc(oldW.getOrderId(), bundle.getId(), oldW.getId());
            } catch (Exception e) {
                log.warn("清理旧次品记录失败（不阻断）: orderId={}, bundleId={}", oldW.getOrderId(), bundle.getId(), e);
            }
        }
    }

    private void upsertUpdateScanRecords(ProductWarehousing pw, ProductWarehousing oldW, CuttingBundle bundle,
            String computedQualityStatus, int qualified, int warehousingQty, int unqualified, LocalDateTime now) {
        if (!StringUtils.hasText(oldW.getOrderId())) return;
        try {
            Long tenantId = UserContext.tenantId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, oldW.getOrderId())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
            if (order == null) return;
            ProductWarehousing current = buildCurrentForScanRecord(pw, oldW, order, computedQualityStatus, qualified, warehousingQty, unqualified);
            helper.upsertWarehousingStageScanRecord(current, order, bundle, now);
            helper.upsertWarehouseScanRecord(current, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehousing stage scan record after warehousing update: warehousingId={}, orderId={}",
                    oldW.getId(), oldW.getOrderId(), e);
        }
    }

    private ProductWarehousing buildCurrentForScanRecord(ProductWarehousing pw, ProductWarehousing oldW,
            ProductionOrder order, String computedQualityStatus, int qualified, int warehousingQty, int unqualified) {
        ProductWarehousing current = new ProductWarehousing();
        current.setId(oldW.getId());
        current.setOrderId(oldW.getOrderId());
        current.setOrderNo(StringUtils.hasText(oldW.getOrderNo()) ? oldW.getOrderNo() : order.getOrderNo());
        current.setStyleId(StringUtils.hasText(oldW.getStyleId()) ? oldW.getStyleId() : order.getStyleId());
        current.setStyleNo(StringUtils.hasText(oldW.getStyleNo()) ? oldW.getStyleNo() : order.getStyleNo());
        current.setWarehousingType(StringUtils.hasText(oldW.getWarehousingType()) ? oldW.getWarehousingType() : pw.getWarehousingType());
        current.setWarehouse(StringUtils.hasText(pw.getWarehouse()) ? pw.getWarehouse() : oldW.getWarehouse());
        current.setCuttingBundleId(StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId() : oldW.getCuttingBundleId());
        current.setCuttingBundleNo(pw.getCuttingBundleNo() != null ? pw.getCuttingBundleNo() : oldW.getCuttingBundleNo());
        current.setCuttingBundleQrCode(StringUtils.hasText(pw.getCuttingBundleQrCode()) ? pw.getCuttingBundleQrCode() : oldW.getCuttingBundleQrCode());
        current.setQualifiedQuantity(qualified);
        current.setWarehousingQuantity(warehousingQty);
        current.setUnqualifiedQuantity(unqualified);
        current.setQualityStatus(computedQualityStatus);
        return current;
    }

    // ==================== 其他方法 ====================

    @Override
    public boolean softDeleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) return false;
        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, orderId.trim())
                .eq(ProductWarehousing::getDeleteFlag, 0);
        TenantAssert.assertTenantContext();
        Long tid = UserContext.tenantId();
        wrapper.eq(ProductWarehousing::getTenantId, tid);
        return this.remove(wrapper);
    }

    @Override
    public String findExistingWarehousingNoByOrderId(String orderId) {
        return helper.findExistingWarehousingNoByOrderId(orderId);
    }

    @Override
    public String buildWarehousingNo(LocalDateTime now) {
        return helper.buildWarehousingNo(now);
    }

    @Override
    public Map<String, Object> getWarehousingStats() {
        return baseMapper.selectWarehousingStats(com.fashion.supplychain.common.UserContext.tenantId());
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean saveRepairReturnDeclaration(CuttingBundle bundle, ProductionOrder order,
            int qty, String repairRemark, String operatorId, String operatorName, String warehouse) {
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new IllegalArgumentException("菲号信息不完整");
        }
        if (order == null || !StringUtils.hasText(order.getId())) {
            throw new IllegalArgumentException("订单信息不完整");
        }
        if (qty <= 0) {
            throw new IllegalArgumentException("返修申报数量必须大于 0");
        }

        LocalDateTime now = LocalDateTime.now();
        String rr = StringUtils.hasText(repairRemark) ? repairRemark.trim() : "返修完成";
        String warehousingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (!StringUtils.hasText(warehousingNo)) {
            warehousingNo = helper.buildWarehousingNo(now);
        }

        ProductWarehousing w = buildRepairReturnRecord(bundle, order, qty, rr, operatorId, operatorName, warehouse, warehousingNo, now);
        boolean ok = saveWithIdempotency(w);
        if (ok) {
            updateBundleAfterRepairDeclaration(order.getId(), bundle, now);
        }
        return ok;
    }

    private ProductWarehousing buildRepairReturnRecord(CuttingBundle bundle, ProductionOrder order,
            int qty, String rr, String operatorId, String operatorName, String warehouse,
            String warehousingNo, LocalDateTime now) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setOrderNo(order.getOrderNo());
        w.setStyleId(order.getStyleId());
        w.setStyleNo(order.getStyleNo());
        w.setStyleName(order.getStyleName());
        w.setWarehousingNo(warehousingNo);
        w.setWarehousingType(WAREHOUSING_TYPE_REPAIR_RETURN);
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(0);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus(WAREHOUSING_TYPE_REPAIR_RETURN);
        w.setRepairRemark(rr);
        w.setCuttingBundleId(bundle.getId());
        w.setCuttingBundleNo(bundle.getBundleNo());
        w.setCuttingBundleQrCode(bundle.getQrCode());
        if (StringUtils.hasText(operatorId)) {
            w.setWarehousingOperatorId(operatorId);
            w.setReceiverId(operatorId);
        }
        if (StringUtils.hasText(operatorName)) {
            w.setWarehousingOperatorName(operatorName);
            w.setReceiverName(operatorName);
        }
        w.setWarehousingStartTime(now);
        w.setWarehousingEndTime(now);
        w.setCreateTime(now);
        w.setUpdateTime(now);
        w.setDeleteFlag(0);
        return w;
    }

    private void updateBundleAfterRepairDeclaration(String orderId, CuttingBundle bundle, LocalDateTime now) {
        int awaitingRepair = helper.repairDeclarationRemainingQtyByBundle(orderId, bundle.getId(), null);
        String nextStatus = awaitingRepair > 0 ? STATUS_UNQUALIFIED : STATUS_REPAIRED_WAITING_QC;
        try {
            cuttingBundleService.lambdaUpdate()
                    .eq(CuttingBundle::getId, bundle.getId())
                    .set(CuttingBundle::getStatus, nextStatus)
                    .set(CuttingBundle::getUpdateTime, now)
                    .update();
        } catch (Exception e) {
            log.warn("返修申报后更新菲号状态失败: bundleId={}, status={}", bundle.getId(), nextStatus, e);
        }
    }

    @Override
    public int countUCodeWarehousedQuantity(String orderId, String scanCode) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(scanCode)) return 0;
        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductWarehousing> qw =
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductWarehousing>()
                        .select("COALESCE(SUM(qualified_quantity), 0) as totalQty")
                        .eq("delete_flag", 0)
                        .eq("order_id", orderId)
                        .eq("scan_mode", "ucode")
                        .eq("cutting_bundle_qr_code", scanCode)
                        .eq("quality_status", "qualified")
                        .notIn("warehousing_type", "quality_scan", "quality_scan_scrap");
        java.util.List<Map<String, Object>> result = this.listMaps(qw);
        if (result != null && !result.isEmpty()) {
            Object val = result.get(0).get("totalQty");
            if (val instanceof Number) return ((Number) val).intValue();
        }
        return 0;
    }
}
