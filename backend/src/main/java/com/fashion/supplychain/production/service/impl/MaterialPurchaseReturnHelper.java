package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Component
@Slf4j
public class MaterialPurchaseReturnHelper {

    @Autowired
    private MaterialStockService materialStockService;

    boolean confirmReturnPurchase(MaterialPurchaseServiceImpl svc, String purchaseId, String confirmerId,
            String confirmerName, BigDecimal returnQuantity) {
        if (!StringUtils.hasText(purchaseId)) {
            log.warn("confirmReturnPurchase: purchaseId为空");
            return false;
        }
        MaterialPurchase existed = loadPurchaseForReturn(svc, purchaseId);
        if (existed == null) return false;

        validateReturnQuantity(existed, returnQuantity, purchaseId);

        String who = StringUtils.hasText(confirmerName) ? confirmerName.trim()
                : (StringUtils.hasText(confirmerId) ? confirmerId.trim() : "");
        if (!StringUtils.hasText(who)) who = "未命名";

        MaterialPurchase patch = buildReturnPatch(existed, confirmerId, confirmerName, returnQuantity, who);
        syncStockOnReturnConfirm(existed, returnQuantity, purchaseId);

        return persistReturnPatch(svc, purchaseId, patch, existed, returnQuantity, confirmerId, confirmerName, who);
    }

    boolean resetReturnConfirm(MaterialPurchaseServiceImpl svc, String purchaseId, String reason,
            String operatorId, String operatorName) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        MaterialPurchase existed = svc.getOne(
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
        boolean ok = svc.update(retConfirmUw);

        if (ok && !isOrderDrivenPurchase(existed)) {
            try {
                BigDecimal returnQtyBd = existed.getReturnQuantity();
                Integer arrivedQty = existed.getArrivedQuantity();
                if (returnQtyBd != null && returnQtyBd.compareTo(BigDecimal.ZERO) > 0 && arrivedQty != null) {
                    int delta = returnQtyBd.intValue() - arrivedQty;
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

    public boolean isOrderDrivenPurchase(MaterialPurchase purchase) {
        if (purchase == null) return false;
        String sourceType = purchase.getSourceType();
        return "order".equals(sourceType) || "sample".equals(sourceType);
    }

    private MaterialPurchase loadPurchaseForReturn(MaterialPurchaseServiceImpl svc, String purchaseId) {
        MaterialPurchase existed = svc.getOne(
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

    private void validateReturnQuantity(MaterialPurchase existed, BigDecimal returnQuantity, String purchaseId) {
        if (returnQuantity == null) {
            throw new IllegalArgumentException("returnQuantity不能为null");
        }
        if (returnQuantity.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("returnQuantity不能为负数");
        }
        // 不限制回料数量上限，用户可填写任意合法数量
    }

    private MaterialPurchase buildReturnPatch(MaterialPurchase existed, String confirmerId, String confirmerName,
            BigDecimal returnQuantity, String who) {
        String remark = existed.getRemark() == null ? "" : existed.getRemark().trim();
        BigDecimal unitPrice = existed.getUnitPrice() == null ? BigDecimal.ZERO : existed.getUnitPrice();
        String status = existed.getStatus() == null ? "" : existed.getStatus().trim();

        MaterialPurchase patch = new MaterialPurchase();
        patch.setId(existed.getId());
        patch.setReturnConfirmed(1);
        patch.setReturnQuantity(returnQuantity);
        patch.setTotalAmount(unitPrice.multiply(returnQuantity));
        patch.setStatus(returnQuantity.compareTo(BigDecimal.ZERO) > 0 ? MaterialConstants.STATUS_AWAITING_CONFIRM : status);
        patch.setReturnConfirmerId(StringUtils.hasText(confirmerId) ? confirmerId.trim() : null);
        patch.setReturnConfirmerName(StringUtils.hasText(confirmerName) ? confirmerName.trim() : who);
        patch.setReturnConfirmTime(LocalDateTime.now());
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());
        return patch;
    }

    private void syncStockOnReturnConfirm(MaterialPurchase existed, BigDecimal returnQuantity, String purchaseId) {
        int arrivedQty = existed.getArrivedQuantity() == null ? 0 : existed.getArrivedQuantity();
        int delta = returnQuantity.intValue() - arrivedQty;
        if (delta == 0 || isOrderDrivenPurchase(existed)) return;
        try {
            materialStockService.increaseStock(existed, delta);
            log.info("confirmReturnPurchase: 库存同步成功, purchaseId={}, delta={}", purchaseId, delta);
        } catch (Exception e) {
            log.warn("confirmReturnPurchase: 库存同步失败(非致命), purchaseId={}, delta={}, error={}", purchaseId, delta, e.getMessage());
        }
    }

    private boolean persistReturnPatch(MaterialPurchaseServiceImpl svc, String purchaseId, MaterialPurchase patch,
            MaterialPurchase existed, BigDecimal returnQuantity, String confirmerId, String confirmerName, String who) {
        try {
            return svc.updateById(patch);
        } catch (Exception e) {
            log.warn("[confirmReturnPurchase] updateById失败(可能schema缺列)，降级LambdaUpdate: {}", e.getMessage());
            return fallbackUpdateReturn(svc, purchaseId, returnQuantity, existed.getUnitPrice(), patch.getStatus(), confirmerId, confirmerName, who, patch.getRemark());
        }
    }

    private boolean fallbackUpdateReturn(MaterialPurchaseServiceImpl svc, String purchaseId, BigDecimal rq, BigDecimal unitPrice,
            String newStatus, String confirmerId, String confirmerName, String who, String remark) {
        try {
            svc.lambdaUpdate()
                    .eq(MaterialPurchase::getId, purchaseId)
                    .set(MaterialPurchase::getReturnConfirmed, 1)
                    .set(MaterialPurchase::getReturnQuantity, rq)
                    .set(MaterialPurchase::getTotalAmount, unitPrice.multiply(rq))
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
}
