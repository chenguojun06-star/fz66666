package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;
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
    private MaterialPurchaseQueryHelper queryHelper;

    @Autowired
    private MaterialPurchaseReturnHelper returnHelper;

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

        LambdaQueryWrapper<MaterialPurchase> wrapper = queryHelper.buildQueryWrapper(safeParams, tenantId);
        IPage<MaterialPurchase> pageResult = baseMapper.selectPage(new Page<>(page, pageSize), wrapper);

        List<MaterialPurchase> records = pageResult == null ? null : pageResult.getRecords();
        if (records != null && !records.isEmpty()) {
            queryHelper.repairRecords(records);
            queryHelper.enrichFactoryInfo(records);
            queryHelper.enrichFromMaterialDatabase(records);
        }
        return pageResult;
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
    @Transactional(rollbackFor = Exception.class)
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

        if (!StringUtils.hasText(materialPurchase.getUnit())) {
            materialPurchase.setUnit("-");
        }

        serviceHelper.ensureSnapshot(materialPurchase);

        boolean saved = this.save(materialPurchase);

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
        MaterialPurchase oldPurchase = null;
        if (StringUtils.hasText(materialPurchase.getId())) {
            oldPurchase = this.getById(materialPurchase.getId());
        }

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

        boolean updated = this.updateById(materialPurchase);

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
        out.setPlannedAmount(plannedAmount.setScale(2, java.math.RoundingMode.HALF_UP));
        out.setArrivedAmount(arrivedAmount.setScale(2, java.math.RoundingMode.HALF_UP));
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
    @Transactional(rollbackFor = Exception.class)
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
        return returnHelper.confirmReturnPurchase(this, purchaseId, confirmerId, confirmerName, returnQuantity);
    }

    @Override
    public boolean resetReturnConfirm(String purchaseId, String reason, String operatorId, String operatorName) {
        return returnHelper.resetReturnConfirm(this, purchaseId, reason, operatorId, operatorName);
    }

    private boolean isOrderDrivenPurchase(MaterialPurchase purchase) {
        return returnHelper.isOrderDrivenPurchase(purchase);
    }
}
