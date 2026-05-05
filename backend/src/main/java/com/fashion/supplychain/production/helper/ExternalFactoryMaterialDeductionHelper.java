package com.fashion.supplychain.production.helper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.helper.picking.MaterialPurchasePickingSupport;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class ExternalFactoryMaterialDeductionHelper {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPickingService materialPickingService;

    public void applyMaterialDeduction(
            MaterialPicking picking,
            MaterialPurchase purchase,
            List<MaterialPickingItem> items,
            MaterialPurchasePickingSupport.FactorySnapshot factorySnapshot) {
        try {
            String orderId = purchase != null ? purchase.getOrderId() : picking.getOrderId();
            String orderNo = purchase != null ? purchase.getOrderNo() : picking.getOrderNo();
            if (!StringUtils.hasText(orderId) && !StringUtils.hasText(orderNo)) {
                return;
            }

            BigDecimal totalMaterialCost = BigDecimal.ZERO;
            for (MaterialPickingItem item : items) {
                BigDecimal unitPrice = item.getUnitPrice();
                if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
                    if (purchase != null && purchase.getUnitPrice() != null) {
                        unitPrice = purchase.getUnitPrice();
                    } else {
                        unitPrice = BigDecimal.ZERO;
                    }
                }
                int qty = item.getQuantity() != null ? item.getQuantity() : 0;
                totalMaterialCost = totalMaterialCost.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            }

            if (totalMaterialCost.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }

            ShipmentReconciliation recon = shipmentReconciliationService.lambdaQuery()
                    .eq(ShipmentReconciliation::getTenantId, UserContext.tenantId())
                    .and(w -> {
                        if (StringUtils.hasText(orderId)) w.eq(ShipmentReconciliation::getOrderId, orderId);
                        if (StringUtils.hasText(orderNo)) w.or().eq(ShipmentReconciliation::getOrderNo, orderNo);
                    })
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("LIMIT 1")
                    .one();

            DeductionItem deduction = new DeductionItem();
            deduction.setReconciliationId(recon != null ? recon.getId() : null);
            deduction.setDeductionType("MATERIAL_PICKUP");
            deduction.setDeductionAmount(totalMaterialCost);
            deduction.setSourceType("MATERIAL_PICKING");
            deduction.setSourceId(picking.getId());
            deduction.setDescription("外发工厂领料扣款|" + (factorySnapshot.factoryName != null ? factorySnapshot.factoryName : "")
                    + "|pickingNo=" + picking.getPickingNo()
                    + "|物料" + items.size() + "项|金额" + totalMaterialCost.setScale(2, RoundingMode.HALF_UP));
            deductionItemMapper.insert(deduction);

            if (recon == null) {
                log.info("外发工厂面料扣款: 暂无出货对账单，扣款已暂存(无reconciliationId)，关单时自动归集, orderNo={}, pickingNo={}", orderNo, picking.getPickingNo());
                return;
            }

            BigDecimal existingDeduction = recon.getDeductionAmount() != null ? recon.getDeductionAmount() : BigDecimal.ZERO;
            BigDecimal existingSupplement = BigDecimal.ZERO;
            List<DeductionItem> existingItems = deductionItemMapper.selectByReconciliationId(recon.getId(), UserContext.tenantId());
            if (existingItems != null) {
                for (DeductionItem di : existingItems) {
                    if ("SUPPLEMENT".equalsIgnoreCase(di.getDeductionType())) {
                        existingSupplement = existingSupplement.add(di.getDeductionAmount() != null ? di.getDeductionAmount() : BigDecimal.ZERO);
                    }
                }
            }
            recon.setDeductionAmount(existingDeduction.add(totalMaterialCost));
            BigDecimal totalAmount = recon.getTotalAmount() != null ? recon.getTotalAmount() : BigDecimal.ZERO;
            recon.setFinalAmount(totalAmount.subtract(recon.getDeductionAmount()).add(existingSupplement));
            shipmentReconciliationService.updateById(recon);

            log.info("外发工厂面料扣款已记录: orderNo={}, pickingNo={}, deductionAmount={}, totalDeduction={}",
                    orderNo, picking.getPickingNo(), totalMaterialCost, recon.getDeductionAmount());
        } catch (Exception e) {
            log.error("外发工厂面料扣款记录失败: pickingId={}", picking.getId(), e);
        }
    }

    public void rollbackMaterialDeduction(String pickingId) {
        List<DeductionItem> items = deductionItemMapper.selectList(
                new LambdaQueryWrapper<DeductionItem>()
                        .eq(DeductionItem::getTenantId, UserContext.tenantId())
                        .eq(DeductionItem::getSourceType, "MATERIAL_PICKING")
                        .eq(DeductionItem::getSourceId, pickingId));
        if (items == null || items.isEmpty()) {
            return;
        }

        Set<String> reconIds = items.stream()
                .map(DeductionItem::getReconciliationId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        Map<String, ShipmentReconciliation> reconMap = reconIds.isEmpty()
                ? Collections.emptyMap()
                : shipmentReconciliationService.listByIds(reconIds).stream()
                        .collect(Collectors.toMap(ShipmentReconciliation::getId, r -> r, (a, b) -> a));

        for (DeductionItem item : items) {
            String reconId = item.getReconciliationId();
            BigDecimal amount = item.getDeductionAmount() != null ? item.getDeductionAmount() : BigDecimal.ZERO;
            deductionItemMapper.deleteById(item.getId());

            if (!StringUtils.hasText(reconId)) {
                log.info("外发工厂领料扣款已回退(暂存记录): pickingId={}, rollbackAmount={}", pickingId, amount);
                continue;
            }

            ShipmentReconciliation recon = reconMap.get(reconId);
            if (recon != null) {
                BigDecimal existingDeduction = recon.getDeductionAmount() != null ? recon.getDeductionAmount() : BigDecimal.ZERO;
                BigDecimal newDeduction = existingDeduction.subtract(amount);
                if (newDeduction.compareTo(BigDecimal.ZERO) < 0) {
                    newDeduction = BigDecimal.ZERO;
                }
                recon.setDeductionAmount(newDeduction);
                BigDecimal totalAmount = recon.getTotalAmount() != null ? recon.getTotalAmount() : BigDecimal.ZERO;
                List<DeductionItem> remainingItems = deductionItemMapper.selectByReconciliationId(reconId, UserContext.tenantId());
                BigDecimal supplementAmount = BigDecimal.ZERO;
                if (remainingItems != null) {
                    for (DeductionItem di : remainingItems) {
                        if ("SUPPLEMENT".equalsIgnoreCase(di.getDeductionType())) {
                            supplementAmount = supplementAmount.add(di.getDeductionAmount() != null ? di.getDeductionAmount() : BigDecimal.ZERO);
                        }
                    }
                }
                recon.setFinalAmount(totalAmount.subtract(newDeduction).add(supplementAmount));
                shipmentReconciliationService.updateById(recon);
                log.info("外发工厂领料扣款已回退: pickingId={}, reconId={}, rollbackAmount={}", pickingId, reconId, amount);
            }
        }
    }

    public void attachOrphanDeductionsToReconciliation(String orderId, String orderNo, String reconciliationId) {
        if (!StringUtils.hasText(reconciliationId)) return;

        List<DeductionItem> orphans = deductionItemMapper.selectList(
                new LambdaQueryWrapper<DeductionItem>()
                        .eq(DeductionItem::getTenantId, UserContext.tenantId())
                        .eq(DeductionItem::getDeductionType, "MATERIAL_PICKUP")
                        .isNull(DeductionItem::getReconciliationId));
        if (orphans == null || orphans.isEmpty()) return;

        if (StringUtils.hasText(orderId)) {
            orphans = orphans.stream()
                    .filter(o -> orderId.equals(resolveOrderIdFromSource(o)))
                    .collect(java.util.stream.Collectors.toList());
            if (orphans.isEmpty()) return;
        }

        BigDecimal totalOrphanAmount = BigDecimal.ZERO;
        for (DeductionItem orphan : orphans) {
            orphan.setReconciliationId(reconciliationId);
            deductionItemMapper.updateById(orphan);
            totalOrphanAmount = totalOrphanAmount.add(orphan.getDeductionAmount() != null ? orphan.getDeductionAmount() : BigDecimal.ZERO);
        }

        if (totalOrphanAmount.compareTo(BigDecimal.ZERO) > 0) {
            ShipmentReconciliation recon = shipmentReconciliationService.getById(reconciliationId);
            if (recon != null) {
                BigDecimal existingDeduction = recon.getDeductionAmount() != null ? recon.getDeductionAmount() : BigDecimal.ZERO;
                recon.setDeductionAmount(existingDeduction.add(totalOrphanAmount));
                BigDecimal totalAmount = recon.getTotalAmount() != null ? recon.getTotalAmount() : BigDecimal.ZERO;
                List<DeductionItem> allItems = deductionItemMapper.selectByReconciliationId(reconciliationId, UserContext.tenantId());
                BigDecimal supplementAmount = BigDecimal.ZERO;
                if (allItems != null) {
                    for (DeductionItem di : allItems) {
                        if ("SUPPLEMENT".equalsIgnoreCase(di.getDeductionType())) {
                            supplementAmount = supplementAmount.add(di.getDeductionAmount() != null ? di.getDeductionAmount() : BigDecimal.ZERO);
                        }
                    }
                }
                recon.setFinalAmount(totalAmount.subtract(recon.getDeductionAmount()).add(supplementAmount));
                shipmentReconciliationService.updateById(recon);
                log.info("外发工厂暂存扣款已归集到出货对账单: orderId={}, reconId={}, totalOrphanAmount={}",
                        orderId, reconciliationId, totalOrphanAmount);
            }
        }
    }

    private String resolveOrderIdFromSource(DeductionItem item) {
        if (!"MATERIAL_PICKING".equals(item.getSourceType()) || !StringUtils.hasText(item.getSourceId())) {
            return null;
        }
        try {
            com.fashion.supplychain.production.entity.MaterialPicking picking =
                    materialPickingService.getById(item.getSourceId());
            return picking != null ? picking.getOrderId() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
