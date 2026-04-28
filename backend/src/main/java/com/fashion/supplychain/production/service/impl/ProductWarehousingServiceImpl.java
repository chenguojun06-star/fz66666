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
import com.fashion.supplychain.production.helper.WarehousingWriteHelper;

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

    @Autowired
    private WarehousingWriteHelper writeHelper;

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

        ProductionOrder order = writeHelper.validateOrderForSave(pw);
        writeHelper.resolveWarehousingNo(pw, order);
        String computedQualityStatus = writeHelper.validateAndNormalizeQuantities(pw);
        String repairRemark = helper.trimToNull(pw.getRepairRemark());

        WarehousingWriteHelper.BundleResolveResult bundleResult = writeHelper.resolveBundleAndValidateRepair(pw, order, computedQualityStatus, repairRemark);
        CuttingBundle bundle = bundleResult.bundle();
        boolean bundleIsBlocked = bundleResult.blocked();
        repairRemark = bundleResult.repairRemark();

        writeHelper.validateQuantityRange(order, pw.getWarehousingQuantity(), bundleIsBlocked, computedQualityStatus, repairRemark, skipRangeCheck);
        writeHelper.fillDefaultFields(pw, order, now);

        boolean ok = saveWithIdempotency(pw);
        if (ok) {
            writeHelper.executePostSaveSideEffects(pw, order, bundle, computedQualityStatus, repairRemark, now);
        }
        return ok;
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
        ProductionOrder order = writeHelper.validateOrderForSaveById(orderId);

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

        writeHelper.validateOrderNotTerminal(oldW.getOrderId());

        LocalDateTime now = LocalDateTime.now();
        pw.setUpdateTime(now);
        String computedQualityStatus = writeHelper.validateAndNormalizeUpdateQuantities(pw, oldW);
        int qualified = pw.getQualifiedQuantity();
        int unqualified = pw.getUnqualifiedQuantity();
        int warehousingQty = pw.getWarehousingQuantity();

        writeHelper.validateUpdateQuantityRange(oldW, warehousingQty);
        writeHelper.validateBundleNotAlreadyWarehoused(pw, oldW);

        boolean ok = this.updateById(pw);
        if (!ok) return false;

        writeHelper.syncOrderCompletedQuantity(oldW.getOrderId());
        CuttingBundle bundle = writeHelper.loadBundleForUpdate(pw, oldW);
        writeHelper.handleUpdateSkuStockDiff(pw, oldW, bundle);
        writeHelper.handleUpdateBundleSideEffects(pw, oldW, bundle, computedQualityStatus, now);
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
        ProductWarehousing newRecord = writeHelper.buildManualRecordFromQualityScan(oldW, pw);
        return this.saveWarehousingAndUpdateOrder(newRecord);
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
            ProductWarehousing current = writeHelper.buildCurrentForScanRecord(pw, oldW, order, computedQualityStatus, qualified, warehousingQty, unqualified);
            helper.upsertWarehousingStageScanRecord(current, order, bundle, now);
            helper.upsertWarehouseScanRecord(current, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehousing stage scan record after warehousing update: warehousingId={}, orderId={}",
                    oldW.getId(), oldW.getOrderId(), e);
        }
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

        ProductWarehousing w = writeHelper.buildRepairReturnRecord(bundle, order, qty, rr, operatorId, operatorName, warehouse, warehousingNo, now);
        boolean ok = saveWithIdempotency(w);
        if (ok) {
            writeHelper.updateBundleAfterRepairDeclaration(order.getId(), bundle, now);
        }
        return ok;
    }

    // ==================== 其他方法 ====================

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
