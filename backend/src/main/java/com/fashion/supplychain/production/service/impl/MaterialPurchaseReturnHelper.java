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
                BigDecimal arrivedQty = existed.getArrivedQuantity();
                if (returnQtyBd != null && returnQtyBd.compareTo(BigDecimal.ZERO) > 0 && arrivedQty != null) {
                    // D-410：差额改 BigDecimal，不要 intValue() 截断
                    BigDecimal delta = returnQtyBd.subtract(arrivedQty);
                    if (delta.compareTo(BigDecimal.ZERO) > 0) {
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
     * 判断是否为"订单驱动"的采购任务。
     * <p>P1-5 说明：仅 order（大货订单）/ sample（样衣采购）两种 sourceType 视为订单驱动，
     * 应回料/撤回时不在此处回退库存（由订单状态机或后续流程处理）。
     * batch/stock/manual 三种 sourceType 不涉及订单库存，保持当前逻辑（不在订单驱动集合内），
     * 回料确认/撤回时按原逻辑同步库存增减。
     */
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
        /*
         * D-513 修复：回料确认 = 登记「实际到货数量」，必须同步回写到货量列。
         *
         * 此前只写 returnQuantity、**不回写 arrivedQuantity**，于是 arrivedQuantity 停留在
         * confirmComplete 的兜底值（= 预采购数）。下游全部按预采购数取值，后果：
         *   ① 物料对账的「实到数量」= 预采购数 → 供应商多送/少送都按计划数结算，货款算错；
         *   ② 采购列表还得靠 repairRecords 临时把 arrivedQuantity 顶成 returnQuantity 才显示正确，
         *      列表与对账两处口径不一致；
         *   ③ 本方法紧接着算的 totalAmount 又用「实际到货 × 单价」，而实际到货根本没落库，自相矛盾。
         */
        patch.setArrivedQuantity(returnQuantity);
        // 金额按「实际到货数量 × 单价」重算（与 D-464 声明口径一致；此前用旧 arrivedQuantity 算，与声明不符）
        patch.setTotalAmount(
                com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper
                        .calcTotalAmountByArrived(existed.getUnitPrice(), returnQuantity));
        patch.setStatus(returnQuantity.compareTo(BigDecimal.ZERO) > 0 ? MaterialConstants.STATUS_AWAITING_CONFIRM : status);
        patch.setReturnConfirmerId(StringUtils.hasText(confirmerId) ? confirmerId.trim() : null);
        patch.setReturnConfirmerName(StringUtils.hasText(confirmerName) ? confirmerName.trim() : who);
        patch.setReturnConfirmTime(LocalDateTime.now());
        patch.setRemark(remark);
        patch.setUpdateTime(LocalDateTime.now());
        return patch;
    }

    private void syncStockOnReturnConfirm(MaterialPurchase existed, BigDecimal returnQuantity, String purchaseId) {
        BigDecimal arrivedQty = existed.getArrivedQuantity() == null ? BigDecimal.ZERO : existed.getArrivedQuantity();
        BigDecimal delta = returnQuantity.subtract(arrivedQty);
        if (delta.compareTo(BigDecimal.ZERO) == 0 || isOrderDrivenPurchase(existed)) return;
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
                    // D-513：降级路径同样要回写到货量，否则两条路径结果不一致
                    .set(MaterialPurchase::getArrivedQuantity, rq)
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
