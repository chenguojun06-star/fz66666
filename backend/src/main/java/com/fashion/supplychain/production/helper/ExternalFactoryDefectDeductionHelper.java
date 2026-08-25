package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/**
 * 次品扣款归集 Helper。
 * <p>
 * D-127 起次品扣款不再由系统自动创建（自动扣款易引发争议，改为审核时提醒 + 用户在对账单
 * 「扣款明细」中手动添加）。本类仅保留关单归集能力：把历史上无主（reconciliationId 为空）的
 * 次品/报废扣款项挂到关单生成的出货对账单上。
 * </p>
 */
@Component
@Slf4j
public class ExternalFactoryDefectDeductionHelper {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private com.fashion.supplychain.finance.mapper.ShipmentReconciliationMapper shipmentReconciliationMapper;

    @Autowired
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;

    public void attachOrphanDeductionsToReconciliation(String orderId, String orderNo, String reconciliationId) {
        if (!StringUtils.hasText(reconciliationId)) return;

        ShipmentReconciliation recon = shipmentReconciliationService.getById(reconciliationId);
        if (recon == null || !UserContext.tenantId().equals(recon.getTenantId())) {
            log.warn("[DefectDeduction] 对账单不属于当前租户，跳过归集: reconciliationId={}", reconciliationId);
            return;
        }

        List<DeductionItem> orphans = deductionItemMapper.selectList(
                new LambdaQueryWrapper<DeductionItem>()
                        .eq(DeductionItem::getTenantId, UserContext.tenantId())
                        .in(DeductionItem::getDeductionType, "QUALITY_DEFECT", "PRODUCT_SCRAP")
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
            shipmentReconciliationMapper.recalculateDeductionAndFinal(reconciliationId, recon.getTenantId());
            log.info("[DefectDeduction] 暂存次品扣款已归集到出货对账单: orderId={}, reconId={}, totalOrphanAmount={}",
                    orderId, reconciliationId, totalOrphanAmount);
        }
    }

    private String resolveOrderIdFromSource(DeductionItem item) {
        if (!"PRODUCT_WAREHOUSING".equals(item.getSourceType()) || !StringUtils.hasText(item.getSourceId())) {
            return null;
        }
        try {
            com.fashion.supplychain.production.entity.ProductWarehousing wh =
                    productWarehousingService.getById(item.getSourceId());
            return wh != null ? wh.getOrderId() : null;
        } catch (Exception e) {
            return null;
        }
    }
}
