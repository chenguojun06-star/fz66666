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
     * 冲减应付账款（找到该供应商最新未付款的应付记录，减少应付金额）
     *
     * @param returnEntity 退货单（含 supplierId + totalAmount）
     */
    public void decreasePayable(PurchaseReturn returnEntity) {
        BigDecimal totalAmount = returnEntity.getTotalAmount();
        if (totalAmount == null || totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Long tenantId = returnEntity.getTenantId();
        // P0铁律4：必须用AND保持tenant_id隔离，禁止.or()绕过租户过滤
        List<Payable> payables = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getTenantId, tenantId)
                        .eq(Payable::getSupplierId, returnEntity.getSupplierId())
                        .eq(Payable::getDeleteFlag, 0)
                        .orderByDesc(Payable::getCreateTime)
        );
        if (payables.isEmpty()) {
            log.warn("采购退货未找到对应应付账款记录，跳过应付更新: supplierId={}", returnEntity.getSupplierId());
            return;
        }
        Payable latestPayable = payables.get(0);
        BigDecimal paidAmountDelta = totalAmount.negate(); // 负数：减少应付
        payableService.atomicAddPaidAmount(latestPayable.getId(), paidAmountDelta);
        log.info("采购退货应付账款更新成功: payableId={}, delta={}", latestPayable.getId(), paidAmountDelta);
    }
}
