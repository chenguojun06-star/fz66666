package com.fashion.supplychain.production.helper.picking;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;

import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.helper.ExternalFactoryMaterialDeductionHelper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 出库单撤销与库存回退。
 *
 * <p>从原 {@code MaterialPurchasePickingHelper} 第 736 ~ 808 行剥离。
 */
@Component
@Slf4j
public class MaterialPurchaseCancelHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private ExternalFactoryMaterialDeductionHelper externalFactoryDeductionHelper;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelPicking(Map<String, Object> body) {
        String pickingId = ParamUtils.toTrimmedString(body == null ? null : body.get("pickingId"));
        String reason = ParamUtils.toTrimmedString(body == null ? null : body.get("reason"));

        if (!StringUtils.hasText(pickingId)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("撤销原因不能为空");
        }

        String currentRole = UserContext.role();
        if (currentRole == null || (!currentRole.contains("admin") && !currentRole.contains("supervisor")
                && !currentRole.contains("manager") && !currentRole.contains("主管") && !currentRole.contains("管理员"))) {
            log.warn("用户 {} 尝试撤销出库单，角色: {}", UserContext.username(), currentRole);
        }

        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || picking.getDeleteFlag() != null && picking.getDeleteFlag() == 1) {
            throw new NoSuchElementException("出库单不存在或已被删除");
        }
        TenantAssert.assertBelongsToCurrentTenant(picking.getTenantId(), "领料出库单");
        if ("cancelled".equals(picking.getStatus())) {
            throw new IllegalStateException("出库单已撤销，不可重复操作");
        }

        List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);
        boolean wasCompleted = "completed".equalsIgnoreCase(picking.getStatus());

        restoreStockForItems(items, wasCompleted);

        picking.setStatus(MaterialConstants.STATUS_CANCELLED);
        picking.setRemark("【撤销】" + reason + " | 操作人: " + UserContext.username() + " | 原备注: "
                + (picking.getRemark() != null ? picking.getRemark() : ""));
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        if (wasCompleted) {
            externalFactoryDeductionHelper.rollbackMaterialDeduction(pickingId);
        }

        restoreRelatedPurchaseStatus(picking.getOrderNo(), items);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("status", "cancelled");
        result.put("reason", reason);
        result.put("restoredItems", items.size());
        log.info("✅ 出库单已撤销: pickingNo={}, reason={}, 回退{}项物料", picking.getPickingNo(), reason, items.size());
        return result;
    }

    private void restoreStockForItems(List<MaterialPickingItem> items, boolean wasCompleted) {
        for (MaterialPickingItem item : items) {
            if (item.getMaterialStockId() != null) {
                if (wasCompleted) {
                    materialStockService.updateStockQuantity(item.getMaterialStockId(), item.getQuantity());
                } else {
                    materialStockService.unlockStock(item.getMaterialStockId(), item.getQuantity());
                }
            }
        }
    }

    private void restoreRelatedPurchaseStatus(String orderNo, List<MaterialPickingItem> items) {
        if (!StringUtils.hasText(orderNo)) {
            return;
        }
        Set<String> materialCodes = items.stream()
                .map(MaterialPickingItem::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (materialCodes.isEmpty()) {
            return;
        }
        materialPurchaseService.lambdaUpdate()
                .eq(MaterialPurchase::getOrderNo, orderNo)
                .in(MaterialPurchase::getMaterialCode, materialCodes)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .in(MaterialPurchase::getStatus,
                        MaterialConstants.STATUS_COMPLETED,
                        MaterialConstants.STATUS_AWAITING_CONFIRM,
                        MaterialConstants.STATUS_PARTIAL,
                        MaterialConstants.STATUS_WAREHOUSE_PENDING)
                .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                .set(MaterialPurchase::getReceivedTime, null)
                .set(MaterialPurchase::getReceiverId, null)
                .set(MaterialPurchase::getReceiverName, null)
                .set(MaterialPurchase::getArrivedQuantity, 0)
                .set(MaterialPurchase::getUpdateTime, LocalDateTime.now())
                .update();
        log.info("✅ 采购任务已批量恢复: orderNo={}, materialCodes={}", orderNo, materialCodes);
    }
}
