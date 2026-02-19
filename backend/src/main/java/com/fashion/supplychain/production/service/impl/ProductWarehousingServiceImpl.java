package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
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
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.util.StringUtils;
import org.springframework.transaction.annotation.Transactional;
import lombok.extern.slf4j.Slf4j;
import java.util.List;

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
        String cuttingBundleQrCode = ParamUtils
                .toTrimmedString(ParamUtils.getIgnoreCase(safeParams, "cuttingBundleQrCode"));

        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .like(StringUtils.hasText(warehousingNo), ProductWarehousing::getWarehousingNo, warehousingNo)
                .eq(StringUtils.hasText(orderId), ProductWarehousing::getOrderId, orderId)
                .like(StringUtils.hasText(orderNo), ProductWarehousing::getOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), ProductWarehousing::getStyleNo, styleNo)
                .eq(StringUtils.hasText(warehouse), ProductWarehousing::getWarehouse, warehouse)
                .eq(StringUtils.hasText(qualityStatus), ProductWarehousing::getQualityStatus, qualityStatus)
                .eq(StringUtils.hasText(cuttingBundleId), ProductWarehousing::getCuttingBundleId, cuttingBundleId)
                .eq(StringUtils.hasText(cuttingBundleQrCode), ProductWarehousing::getCuttingBundleQrCode,
                        cuttingBundleQrCode)
                .orderByDesc(ProductWarehousing::getCreateTime);

        return baseMapper.selectPage(pageInfo, wrapper);
    }

    private boolean saveWarehousingAndUpdateOrderInternal(ProductWarehousing productWarehousing,
            boolean skipRangeCheck) {
        // 设置默认值
        LocalDateTime now = LocalDateTime.now();

        if (!StringUtils.hasText(productWarehousing.getOrderId())) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(productWarehousing.getOrderId());
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }

        String existingWarehousingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (StringUtils.hasText(existingWarehousingNo)) {
            productWarehousing.setWarehousingNo(existingWarehousingNo);
        }

        int qualified = productWarehousing.getQualifiedQuantity() == null ? 0
                : productWarehousing.getQualifiedQuantity();
        int unqualified = productWarehousing.getUnqualifiedQuantity() == null ? 0
                : productWarehousing.getUnqualifiedQuantity();
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        int warehousingQty = productWarehousing.getWarehousingQuantity() == null ? (qualified + unqualified)
                : productWarehousing.getWarehousingQuantity();
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        productWarehousing.setWarehousingQuantity(warehousingQty);
        productWarehousing.setQualifiedQuantity(qualified);
        productWarehousing.setUnqualifiedQuantity(unqualified);

        String computedQualityStatus = unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
        productWarehousing.setQualityStatus(computedQualityStatus);
        String repairRemark = helper.trimToNull(productWarehousing.getRepairRemark());

        if (!skipRangeCheck) {
            String msg = helper.warehousingQuantityRuleViolationMessage(order.getId(), warehousingQty, null);
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }

        CuttingBundle bundle = null;
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim()
                : null;
        String bundleQr = StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                ? productWarehousing.getCuttingBundleQrCode().trim()
                : null;
        if (StringUtils.hasText(bundleId) || StringUtils.hasText(bundleQr)) {
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
            boolean blocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
            if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
                throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
            }
            if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                    && !StringUtils.hasText(repairRemark)) {
                throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，请填写返修备注后再进行质检入库");
            }
            if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                    && StringUtils.hasText(repairRemark)) {
                helper.ensureRepairQuantityNotExceeded(order.getId(), bundle.getId(), warehousingQty, null);
            }
            productWarehousing.setCuttingBundleId(bundle.getId());
            productWarehousing.setCuttingBundleNo(bundle.getBundleNo());
            productWarehousing.setCuttingBundleQrCode(bundle.getQrCode());

            helper.ensureBundleNotAlreadyQualifiedWarehoused(order.getId(), bundle.getId(), null);
        }

        if (!StringUtils.hasText(productWarehousing.getOrderNo())) {
            productWarehousing.setOrderNo(order.getOrderNo());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleId())) {
            productWarehousing.setStyleId(order.getStyleId());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleNo())) {
            productWarehousing.setStyleNo(order.getStyleNo());
        }
        if (!StringUtils.hasText(productWarehousing.getStyleName())) {
            productWarehousing.setStyleName(order.getStyleName());
        }

        if (!StringUtils.hasText(productWarehousing.getWarehousingNo())) {
            productWarehousing.setWarehousingNo(helper.buildWarehousingNo(now));
        }
        if (!StringUtils.hasText(productWarehousing.getWarehousingType())) {
            productWarehousing.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
        }

        // 设置入库时间（入库开始时间和完成时间同时设置为当前时间）
        if (productWarehousing.getWarehousingStartTime() == null) {
            productWarehousing.setWarehousingStartTime(now);
        }
        if (productWarehousing.getWarehousingEndTime() == null) {
            productWarehousing.setWarehousingEndTime(now);
        }
        // 入库人员信息（如果未设置，尝试从receiver复制）
        if (!StringUtils.hasText(productWarehousing.getWarehousingOperatorId())
                && StringUtils.hasText(productWarehousing.getReceiverId())) {
            productWarehousing.setWarehousingOperatorId(productWarehousing.getReceiverId());
        }
        if (!StringUtils.hasText(productWarehousing.getWarehousingOperatorName())
                && StringUtils.hasText(productWarehousing.getReceiverName())) {
            productWarehousing.setWarehousingOperatorName(productWarehousing.getReceiverName());
        }

        productWarehousing.setCreateTime(now);
        productWarehousing.setUpdateTime(now);
        productWarehousing.setDeleteFlag(0);

        // 保存质检入库记录
        boolean ok = this.save(productWarehousing);
        if (ok) {
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
            }

            int qualifiedSum = helper.sumQualifiedByOrderId(productWarehousing.getOrderId());
            ProductionOrder patch = new ProductionOrder();
            patch.setId(productWarehousing.getOrderId());
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(patch);

            try {
                helper.upsertWarehousingStageScanRecord(productWarehousing, order, bundle, now);
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehousing stage scan record after warehousing: warehousingId={}, orderId={} ",
                        productWarehousing == null ? null : productWarehousing.getId(),
                        productWarehousing == null ? null : productWarehousing.getOrderId(),
                        e);
            }

            try {
                helper.upsertWarehouseScanRecord(productWarehousing, order, bundle, now);
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehouse scan record after warehousing: warehousingId={}, orderId={} ",
                        productWarehousing == null ? null : productWarehousing.getId(),
                        productWarehousing == null ? null : productWarehousing.getOrderId(),
                        e);
            }

            // Update SKU Stock
            if (productWarehousing.getQualifiedQuantity() != null && productWarehousing.getQualifiedQuantity() > 0) {
                helper.updateSkuStock(productWarehousing, order, bundle, productWarehousing.getQualifiedQuantity());
            }
        }
        return ok;
    }

    @Override
    @Transactional
    public boolean saveWarehousingAndUpdateOrder(ProductWarehousing productWarehousing) {
        return saveWarehousingAndUpdateOrderInternal(productWarehousing, false);
    }

    @Override
    @Transactional
    public boolean saveBatchWarehousingAndUpdateOrder(List<ProductWarehousing> list) {
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        String orderId = null;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            if (StringUtils.hasText(w.getOrderId())) {
                orderId = w.getOrderId().trim();
                break;
            }
        }
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
        int batchSum = 0;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity();
            if (q > 0) {
                batchSum += q;
            }
        }
        String msg = helper.warehousingQuantityRuleViolationMessage(order.getId(), batchSum, null);
        if (StringUtils.hasText(msg)) {
            throw new IllegalStateException(msg);
        }

        LocalDateTime now = LocalDateTime.now();
        String warehousingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (!StringUtils.hasText(warehousingNo)) {
            warehousingNo = helper.buildWarehousingNo(now);
        }

        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            w.setOrderId(order.getId());
            w.setWarehousingNo(warehousingNo);
            if (!StringUtils.hasText(w.getWarehousingType())) {
                w.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
            }
            if (!StringUtils.hasText(w.getQualityStatus())) {
                w.setQualityStatus(STATUS_QUALIFIED);
            }
        }

        boolean okAll = true;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            boolean ok = saveWarehousingAndUpdateOrderInternal(w, true);
            if (!ok) {
                okAll = false;
                throw new IllegalStateException("批量入库失败");
            }
        }
        return okAll;
    }

    @Override
    @Transactional
    public boolean updateWarehousingAndUpdateOrder(ProductWarehousing productWarehousing) {
        // 查询原入库记录
        ProductWarehousing oldWarehousing = this.getById(productWarehousing.getId());
        if (oldWarehousing == null) {
            return false;
        }

        if (StringUtils.hasText(oldWarehousing.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(oldWarehousing.getOrderId());
            String st = order == null ? "" : (order.getStatus() == null ? "" : order.getStatus().trim());
            if (STATUS_COMPLETED.equalsIgnoreCase(st)) {
                throw new IllegalStateException("订单已完成，已停止入库");
            }
        }

        // 设置更新时间
        LocalDateTime now = LocalDateTime.now();
        productWarehousing.setUpdateTime(now);

        Integer uq = productWarehousing.getUnqualifiedQuantity();
        Integer qq = productWarehousing.getQualifiedQuantity();
        Integer wq = productWarehousing.getWarehousingQuantity();
        if (uq == null) {
            uq = oldWarehousing.getUnqualifiedQuantity();
        }
        if (qq == null) {
            qq = oldWarehousing.getQualifiedQuantity();
        }
        if (wq == null) {
            wq = oldWarehousing.getWarehousingQuantity();
        }
        int unqualified = uq == null ? 0 : uq;
        int qualified = qq == null ? 0 : qq;
        int warehousingQty = wq == null ? (qualified + unqualified) : wq;
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        productWarehousing.setWarehousingQuantity(warehousingQty);
        productWarehousing.setQualifiedQuantity(qualified);
        productWarehousing.setUnqualifiedQuantity(unqualified);
        String computedQualityStatus = unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
        productWarehousing.setQualityStatus(computedQualityStatus);

        if (StringUtils.hasText(oldWarehousing.getOrderId())) {
            String msg = helper.warehousingQuantityRuleViolationMessage(oldWarehousing.getOrderId(), warehousingQty,
                    oldWarehousing.getId());
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }

        if (StringUtils.hasText(productWarehousing.getCuttingBundleId())
                && (oldWarehousing.getCuttingBundleId() == null
                        || !productWarehousing.getCuttingBundleId().trim()
                                .equals(oldWarehousing.getCuttingBundleId().trim()))) {
            String oid = StringUtils.hasText(oldWarehousing.getOrderId()) ? oldWarehousing.getOrderId().trim() : null;
            helper.ensureBundleNotAlreadyQualifiedWarehoused(oid, productWarehousing.getCuttingBundleId(),
                    oldWarehousing.getId());
        }

        boolean ok = this.updateById(productWarehousing);
        if (ok && StringUtils.hasText(oldWarehousing.getOrderId())) {
            int qualifiedSum = helper.sumQualifiedByOrderId(oldWarehousing.getOrderId());
            ProductionOrder patch = new ProductionOrder();
            patch.setId(oldWarehousing.getOrderId());
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(now);
            productionOrderService.updateById(patch);
        }
        CuttingBundle bundle = null;
        if (ok) {
            String bid = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                    ? productWarehousing.getCuttingBundleId().trim()
                    : (StringUtils.hasText(oldWarehousing.getCuttingBundleId())
                            ? oldWarehousing.getCuttingBundleId().trim()
                            : null);
            if (StringUtils.hasText(bid)) {
                try {
                    bundle = cuttingBundleService.getById(bid);
                } catch (Exception e) {
                    log.warn("Failed to load cutting bundle when updating warehousing: cuttingBundleId={}", bid, e);
                }
            }

            // Update SKU Stock (Differential)
            int oldQ = oldWarehousing.getQualifiedQuantity() == null ? 0 : oldWarehousing.getQualifiedQuantity();
            int newQ = productWarehousing.getQualifiedQuantity(); // already set to non-null value above
            int diff = newQ - oldQ;
            if (diff != 0) {
                ProductionOrder order = null;
                if (StringUtils.hasText(oldWarehousing.getOrderId())) {
                    order = productionOrderService.getById(oldWarehousing.getOrderId());
                }
                helper.updateSkuStock(productWarehousing, order, bundle, diff);
            }

            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                String repairRemark = helper.trimToNull(productWarehousing.getRepairRemark());
                if (repairRemark == null) {
                    repairRemark = helper.trimToNull(oldWarehousing.getRepairRemark());
                }

                boolean blocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
                if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
                    throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
                }
                if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                        && !StringUtils.hasText(repairRemark)) {
                    throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，请填写返修备注后再进行质检入库");
                }
                if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)
                        && StringUtils.hasText(repairRemark)) {
                    String oid = StringUtils.hasText(oldWarehousing.getOrderId())
                            ? oldWarehousing.getOrderId().trim()
                            : null;
                    helper.ensureRepairQuantityNotExceeded(oid, bundle.getId(), warehousingQty, oldWarehousing.getId());
                }
                helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
            }
        }

        if (ok && StringUtils.hasText(oldWarehousing.getOrderId())) {
            try {
                ProductionOrder order = productionOrderService.getById(oldWarehousing.getOrderId());
                if (order != null) {
                    ProductWarehousing current = new ProductWarehousing();
                    current.setId(oldWarehousing.getId());
                    current.setOrderId(oldWarehousing.getOrderId());
                    current.setOrderNo(StringUtils.hasText(oldWarehousing.getOrderNo()) ? oldWarehousing.getOrderNo()
                            : order.getOrderNo());
                    current.setStyleId(StringUtils.hasText(oldWarehousing.getStyleId()) ? oldWarehousing.getStyleId()
                            : order.getStyleId());
                    current.setStyleNo(StringUtils.hasText(oldWarehousing.getStyleNo()) ? oldWarehousing.getStyleNo()
                            : order.getStyleNo());
                    current.setWarehousingType(StringUtils.hasText(oldWarehousing.getWarehousingType())
                            ? oldWarehousing.getWarehousingType()
                            : productWarehousing.getWarehousingType());
                    current.setWarehouse(StringUtils.hasText(productWarehousing.getWarehouse())
                            ? productWarehousing.getWarehouse()
                            : oldWarehousing.getWarehouse());
                    current.setCuttingBundleId(StringUtils.hasText(productWarehousing.getCuttingBundleId())
                            ? productWarehousing.getCuttingBundleId()
                            : oldWarehousing.getCuttingBundleId());
                    current.setCuttingBundleNo(
                            productWarehousing.getCuttingBundleNo() != null ? productWarehousing.getCuttingBundleNo()
                                    : oldWarehousing.getCuttingBundleNo());
                    current.setCuttingBundleQrCode(StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                            ? productWarehousing.getCuttingBundleQrCode()
                            : oldWarehousing.getCuttingBundleQrCode());
                    current.setQualifiedQuantity(qualified);
                    current.setWarehousingQuantity(warehousingQty);
                    current.setUnqualifiedQuantity(unqualified);
                    current.setQualityStatus(computedQualityStatus);
                    helper.upsertWarehousingStageScanRecord(current, order, bundle, now);
                    helper.upsertWarehouseScanRecord(current, order, bundle, now);
                }
            } catch (Exception e) {
                log.warn(
                        "Failed to upsert warehousing stage scan record after warehousing update: warehousingId={}, orderId={}",
                        oldWarehousing.getId(),
                        oldWarehousing.getOrderId(),
                        e);
            }
        }
        return ok;
    }

    @Override
    public boolean softDeleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return false;
        }
        ProductWarehousing patch = new ProductWarehousing();
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        return this.update(patch, new LambdaUpdateWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, orderId.trim())
                .eq(ProductWarehousing::getDeleteFlag, 0));
    }

}

