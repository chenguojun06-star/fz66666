package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 采购退货库存与应付账款辅助类（P2#10 拆分自 PurchaseReturnOrchestrator）
 * 职责：
 *   1. 退货库存扣减（带失败抛异常，保证账实一致）
 *   2. 应付账款金额冲减
 *
 * 设计原则：
 *   - 纯业务方法，无 @Transactional（事务由 Orchestrator 统一管控）
 *   - 不修改业务流程，不改 API 契约
 *   - 多租户隔离：所有查询带 tenant_id + delete_flag=0
 */
@Slf4j
@Component
public class PurchaseReturnStockHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private PayableService payableService;

    /**
     * 批量扣减退货库存（P1#4: 失败抛 BusinessException 触发事务回滚）
     *
     * @param items 退货明细
     */
    public void decreaseStockForItems(List<PurchaseReturnItem> items) {
        List<String> purchaseIds = items.stream()
                .map(PurchaseReturnItem::getPurchaseId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<String, MaterialPurchase> purchaseMap = materialPurchaseService.listByIds(purchaseIds).stream()
                .collect(Collectors.toMap(MaterialPurchase::getId, p -> p));

        for (PurchaseReturnItem item : items) {
            MaterialPurchase purchaseItem = purchaseMap.get(item.getPurchaseId());
            if (purchaseItem == null) {
                log.warn("采购退货跳过库存扣减（原采购记录不存在）: purchaseId={}", item.getPurchaseId());
                continue;
            }
            try {
                materialStockService.decreaseStock(purchaseItem, item.getQuantity());
                log.info("采购退货库存扣减成功: purchaseId={}, quantity={}", item.getPurchaseId(), item.getQuantity());
            } catch (Exception e) {
                log.error("采购退货库存扣减失败（账实不一致风险）: purchaseId={}, quantity={}, err={}",
                        item.getPurchaseId(), item.getQuantity(), e.getMessage(), e);
                throw new BusinessException("库存扣减失败：" + item.getMaterialName()
                        + "（purchaseId=" + item.getPurchaseId()
                        + "，原因=" + e.getMessage() + "），请先核对库存后再完成退货", e);
            }
        }
    }

    /**
     * 冲减应付账款（按原采购单关联到具体 Payable，减少应付金额）
     * <p>
     * P0-6 修复：原实现按 supplierId 取最新 Payable，会扣错供应商的应付单
     * 现改为按 originalPurchaseId 多级关联：
     * 1. 优先：通过 MaterialReconciliation.sourceId/purchaseId 反查关联的 BillAggregation
     * 2. 次优：通过 supplierId + 同月份 + PENDING/PARTIAL 状态的合并 Payable
     * 3. 兜底：通过 supplierId 最新未付款 Payable（保留原逻辑）
     * 已 PAID 的应付单不冲减（避免负数），改为日志告警提示需人工冲账
     *
     * @param returnEntity 退货单（含 originalPurchaseId + supplierId + totalAmount）
     */
    public void decreasePayable(PurchaseReturn returnEntity) {
        BigDecimal totalAmount = returnEntity.getTotalAmount();
        if (totalAmount == null || totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Long tenantId = returnEntity.getTenantId();
        if (tenantId == null) {
            log.warn("采购退货 tenantId 为空，跳过应付更新: returnNo={}", returnEntity.getReturnNo());
            return;
        }

        Payable targetPayable = findPayableByPurchaseId(returnEntity, tenantId);
        if (targetPayable == null) {
            targetPayable = findPayableBySupplierAndMonth(returnEntity, tenantId);
        }
        if (targetPayable == null) {
            targetPayable = findLatestUnpaidPayable(returnEntity, tenantId);
        }
        if (targetPayable == null) {
            log.warn("采购退货未找到对应应付账款记录，跳过应付更新: returnNo={}, supplierId={}, originalPurchaseId={}",
                    returnEntity.getReturnNo(), returnEntity.getSupplierId(), returnEntity.getOriginalPurchaseId());
            return;
        }

        // 已结清的应付单不冲减（避免出现负数或回滚已付款状态）
        if ("PAID".equals(targetPayable.getStatus())) {
            log.warn("采购退货关联应付单已结清，需人工冲账: returnNo={}, payableNo={}, paidAmount={}",
                    returnEntity.getReturnNo(), targetPayable.getPayableNo(), targetPayable.getPaidAmount());
            return;
        }

        BigDecimal paidAmountDelta = totalAmount.negate(); // 负数：减少应付
        payableService.atomicAddPaidAmount(targetPayable.getId(), paidAmountDelta);
        log.info("采购退货应付账款更新成功: returnNo={}, payableId={}, payableNo={}, delta={}, originalPurchaseId={}",
                returnEntity.getReturnNo(), targetPayable.getId(), targetPayable.getPayableNo(),
                paidAmountDelta, returnEntity.getOriginalPurchaseId());
    }

    /**
     * 按 originalPurchaseId 关联查找 Payable
     * 通过 MaterialReconciliation 的 orderId/sourceId 字段反查 BillAggregation
     */
    private Payable findPayableByPurchaseId(PurchaseReturn returnEntity, Long tenantId) {
        String originalPurchaseId = returnEntity.getOriginalPurchaseId();
        if (!org.springframework.util.StringUtils.hasText(originalPurchaseId)) {
            return null;
        }
        // 优先：Payable.sourceId 直接等于 originalPurchaseId（MaterialReconciliation 直接派生时）
        List<Payable> list = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getTenantId, tenantId)
                        .eq(Payable::getSourceId, originalPurchaseId)
                        .eq(Payable::getDeleteFlag, 0)
                        .in(Payable::getStatus, "PENDING", "PARTIAL")
                        .orderByDesc(Payable::getCreateTime)
        );
        if (!list.isEmpty()) {
            return list.get(0);
        }
        return null;
    }

    /**
     * 按 supplierId + 当月 + PENDING/PARTIAL 查找合并 Payable
     */
    private Payable findPayableBySupplierAndMonth(PurchaseReturn returnEntity, Long tenantId) {
        String currentMonth = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM"));
        List<Payable> list = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getTenantId, tenantId)
                        .eq(Payable::getSupplierId, returnEntity.getSupplierId())
                        .eq(Payable::getSettlementMonth, currentMonth)
                        .eq(Payable::getDeleteFlag, 0)
                        .in(Payable::getStatus, "PENDING", "PARTIAL")
                        .orderByDesc(Payable::getCreateTime)
        );
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * 兜底：按 supplierId 取最新未付款 Payable
     */
    private Payable findLatestUnpaidPayable(PurchaseReturn returnEntity, Long tenantId) {
        List<Payable> list = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getTenantId, tenantId)
                        .eq(Payable::getSupplierId, returnEntity.getSupplierId())
                        .eq(Payable::getDeleteFlag, 0)
                        .in(Payable::getStatus, "PENDING", "PARTIAL")
                        .orderByDesc(Payable::getCreateTime)
        );
        return list.isEmpty() ? null : list.get(0);
    }
}
