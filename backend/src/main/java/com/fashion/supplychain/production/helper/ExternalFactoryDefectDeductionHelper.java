package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * 外发工厂成品次品/报废扣款 Helper。
 * <p>
 * 当质检入库发现外发工厂成品存在次品(unqualified)或报废(scrapped)时，
 * 自动在对账单(ShipmentReconciliation)中创建扣款项，工厂结算时自动扣除。
 * </p>
 *
 * <p>触发时机：
 * <ul>
 *   <li>质检扫码标记次品时</li>
 *   <li>返修不合格转为报废时</li>
 * </ul>
 * </p>
 *
 * <p>扣款公式：
 *   单件成本 = (面辅料成本 + 生产成本) / 下单数量
 *   次品扣款 = 单件成本 × 次品数
 *   报废扣款 = 单件成本 × 报废数（不含已扣款的次品）
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
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;

    @Autowired
    private com.fashion.supplychain.finance.mapper.ShipmentReconciliationMapper shipmentReconciliationMapper;

    /**
     * 对质检入库的次品/报废品进行扣款。
     *
     * @param warehousing 质检入库记录
     * @param unitMaterialCost 单件面辅料成本
     * @param unitProductionCost 单件生产成本
     * @param totalOrderQty 订单总下单数
     */
    public void applyDefectDeduction(ProductWarehousing warehousing,
                                      BigDecimal unitMaterialCost,
                                      BigDecimal unitProductionCost,
                                      int totalOrderQty) {
        // 仅外发工厂才需要扣款
        if (warehousing == null || !StringUtils.hasText(warehousing.getFactoryName())) {
            return;
        }
        if (!"EXTERNAL".equalsIgnoreCase(warehousing.getFactoryType())) {
            return;
        }

        int unqualified = warehousing.getUnqualifiedQuantity() != null ? warehousing.getUnqualifiedQuantity() : 0;
        if (unqualified <= 0 || totalOrderQty <= 0) {
            return;
        }

        try {
            String orderId = warehousing.getOrderId();
            String orderNo = warehousing.getOrderNo();
            String factoryName = warehousing.getFactoryName() != null ? warehousing.getFactoryName() : "外发工厂";

            // 查找关联的出货对账单
            ShipmentReconciliation recon = shipmentReconciliationService.lambdaQuery()
                    .and(w -> {
                        if (StringUtils.hasText(orderId)) w.eq(ShipmentReconciliation::getOrderId, orderId);
                        if (StringUtils.hasText(orderNo)) w.or().eq(ShipmentReconciliation::getOrderNo, orderNo);
                    })
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("LIMIT 1")
                    .one();

            BigDecimal unitCost = (unitMaterialCost != null ? unitMaterialCost : BigDecimal.ZERO)
                    .add(unitProductionCost != null ? unitProductionCost : BigDecimal.ZERO);
            if (unitCost.compareTo(BigDecimal.ZERO) <= 0) {
                log.info("[DefectDeduction] 单件成本为0，跳过扣款: orderNo={}", orderNo);
                return;
            }

            // 计算扣款
            BigDecimal defectCost = unitCost.multiply(BigDecimal.valueOf(unqualified))
                    .setScale(2, RoundingMode.HALF_UP);

            // 判断次品处理方式
            String repairStatus = warehousing.getRepairStatus();
            String deductionType;
            String descPrefix;
            if ("scrapped".equalsIgnoreCase(repairStatus)) {
                deductionType = "PRODUCT_SCRAP";
                descPrefix = "成品报废";
            } else {
                deductionType = "QUALITY_DEFECT";
                descPrefix = "成品次品";
            }

            // 创建扣款项
            DeductionItem deduction = new DeductionItem();
            deduction.setReconciliationId(recon != null ? recon.getId() : null);
            deduction.setDeductionType(deductionType);
            deduction.setDeductionAmount(defectCost);
            deduction.setSourceType("PRODUCT_WAREHOUSING");
            deduction.setSourceId(warehousing.getId());
            deduction.setDescription(String.format("%s扣款|%s|warehousingNo=%s|次品%d件|单件成本%.2f|扣款%.2f",
                    descPrefix, factoryName,
                    warehousing.getWarehousingNo() != null ? warehousing.getWarehousingNo() : "",
                    unqualified, unitCost, defectCost));
            deductionItemMapper.insert(deduction);

            if (recon == null) {
                log.info("[DefectDeduction] {}扣款已暂存(暂无出货对账单，关单时自动归集): orderNo={}, factory={}, defectQty={}, amount={}",
                        deductionType, orderNo, factoryName, unqualified, defectCost);
                return;
            }

            shipmentReconciliationMapper.recalculateDeductionAndFinal(recon.getId());

            log.info("[DefectDeduction] {}扣款已记录: orderNo={}, factory={}, defectQty={}, amount={}",
                    deductionType, orderNo, factoryName, unqualified, defectCost);
        } catch (Exception e) {
            log.error("[DefectDeduction] 次品扣款记录失败: warehousingId={}", warehousing.getId(), e);
        }
    }

    /**
     * 返修完成后撤销次品扣款（返修合格入库后不再扣款）。
     */
    public void rollbackDefectDeduction(String warehousingId) {
        try {
            List<DeductionItem> items = deductionItemMapper.selectList(
                    new LambdaQueryWrapper<DeductionItem>()
                            .eq(DeductionItem::getSourceType, "PRODUCT_WAREHOUSING")
                            .eq(DeductionItem::getSourceId, warehousingId));
            if (items == null || items.isEmpty()) {
                return;
            }
            for (DeductionItem item : items) {
                String reconId = item.getReconciliationId();
                BigDecimal amount = item.getDeductionAmount() != null ? item.getDeductionAmount() : BigDecimal.ZERO;
                deductionItemMapper.deleteById(item.getId());

                if (StringUtils.hasText(reconId)) {
                    shipmentReconciliationMapper.recalculateDeductionAndFinal(reconId);
                }
            }
            log.info("[DefectDeduction] 次品扣款已撤销: warehousingId={}", warehousingId);
        } catch (Exception e) {
            log.error("[DefectDeduction] 撤销扣款失败: warehousingId={}", warehousingId, e);
        }
    }

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
            shipmentReconciliationMapper.recalculateDeductionAndFinal(reconciliationId);
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
