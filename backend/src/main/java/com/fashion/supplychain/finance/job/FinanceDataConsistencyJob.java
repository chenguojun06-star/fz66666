package com.fashion.supplychain.finance.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.helper.ExternalFactoryDefectDeductionHelper;
import com.fashion.supplychain.production.helper.ExternalFactoryMaterialDeductionHelper;
import com.fashion.supplychain.production.orchestration.ShipmentReconciliationOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Component
public class FinanceDataConsistencyJob {

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private ExternalFactoryMaterialDeductionHelper materialDeductionHelper;

    @Autowired
    private ExternalFactoryDefectDeductionHelper defectDeductionHelper;

    @Autowired
    private ShipmentReconciliationOrchestrator shipmentReconciliationOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPickingService materialPickingService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 20 */6 * * ?")
    public void checkAndFixFinanceConsistency() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:finance-consistency", 50, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.info("[FinanceConsistency] 其他实例正在执行，跳过");
                return;
            }
            try {
                doCheckAndFix();
            } finally {
                distributedLockService.unlock("job:finance-consistency", lockValue);
            }
        } else {
            doCheckAndFix();
        }
    }

    private void doCheckAndFix() {
        log.info("[FinanceConsistency] 开始财务数据一致性巡检...");
        long start = System.currentTimeMillis();

        List<Long> tenantIds;
        try {
            tenantIds = processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.error("[FinanceConsistency] 获取活跃租户列表失败，任务中止", e);
            return;
        }

        int fixedMissingRecon = 0;
        int fixedOrphanDeductions = 0;
        int fixedDeductionSum = 0;
        int totalFailed = 0;

        for (Long tenantId : tenantIds) {
            TenantAssert.bindTenantForTask(tenantId, "财务一致性巡检");
            try {
                fixedMissingRecon += fixMissingShipmentReconciliations();
                fixedOrphanDeductions += fixOrphanDeductions();
                fixedDeductionSum += fixDeductionSumMismatch(tenantId);
            } catch (Exception e) {
                totalFailed++;
                log.error("[FinanceConsistency] 租户 {} 财务巡检异常", tenantId, e);
            } finally {
                TenantAssert.clearTenantContext();
            }
            try { Thread.sleep(100); } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        long duration = System.currentTimeMillis() - start;
        log.info("[FinanceConsistency] 巡检完成: 补建对账单={}, 归集孤儿扣款={}, 修复扣款汇总={}, 失败租户={}, 耗时{}ms",
                fixedMissingRecon, fixedOrphanDeductions, fixedDeductionSum, totalFailed, duration);
    }

    private int fixMissingShipmentReconciliations() {
        List<ProductionOrder> externalOrders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getFactoryType)
                        .eq(ProductionOrder::getFactoryType, "EXTERNAL")
                        .in(ProductionOrder::getStatus, "production", "completed", "closed")
                        .eq(ProductionOrder::getDeleteFlag, 0));
        if (externalOrders == null || externalOrders.isEmpty()) return 0;

        int fixed = 0;
        for (ProductionOrder order : externalOrders) {
            try {
                int whQty = productWarehousingService.lambdaQuery()
                        .eq(ProductWarehousing::getOrderId, order.getId())
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .count()
                        .intValue();
                if (whQty <= 0) continue;

                boolean hasRecon = shipmentReconciliationService.lambdaQuery()
                        .eq(ShipmentReconciliation::getOrderId, order.getId())
                        .count() > 0;
                if (hasRecon) continue;

                try {
                    shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(order.getId());
                    fixed++;
                    log.info("[FinanceConsistency] 补建出货对账单: orderId={}, orderNo={}",
                            order.getId(), order.getOrderNo());
                } catch (Exception e) {
                    log.warn("[FinanceConsistency] 补建出货对账单失败: orderId={}", order.getId(), e);
                }
            } catch (Exception e) {
                log.warn("[FinanceConsistency] 检查订单出货对账异常: orderId={}", order.getId(), e);
            }
        }
        return fixed;
    }

    private int fixOrphanDeductions() {
        List<DeductionItem> orphans = deductionItemMapper.selectList(
                new LambdaQueryWrapper<DeductionItem>()
                        .isNull(DeductionItem::getReconciliationId));
        if (orphans == null || orphans.isEmpty()) return 0;

        Set<String> orderIds = orphans.stream()
                .map(this::resolveOrderIdFromDeduction)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (orderIds.isEmpty()) return 0;

        int fixed = 0;
        for (String orderId : orderIds) {
            try {
                shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(orderId);
                fixed++;
            } catch (Exception e) {
                log.warn("[FinanceConsistency] 归集孤儿扣款失败: orderId={}", orderId, e);
            }
        }
        return fixed;
    }

    private String resolveOrderIdFromDeduction(DeductionItem item) {
        if (!StringUtils.hasText(item.getSourceId())) return null;
        try {
            if ("MATERIAL_PICKING".equals(item.getSourceType())) {
                com.fashion.supplychain.production.entity.MaterialPicking p =
                        materialPickingService.getById(item.getSourceId());
                return p != null ? p.getOrderId() : null;
            } else if ("PRODUCT_WAREHOUSING".equals(item.getSourceType())) {
                ProductWarehousing wh = productWarehousingService.getById(item.getSourceId());
                return wh != null ? wh.getOrderId() : null;
            }
        } catch (Exception e) {
            return null;
        }
        return null;
    }

    private int fixDeductionSumMismatch(Long tenantId) {
        List<ShipmentReconciliation> recons = shipmentReconciliationService.list();
        if (recons == null || recons.isEmpty()) return 0;

        int fixed = 0;
        for (ShipmentReconciliation recon : recons) {
            try {
                List<DeductionItem> items = deductionItemMapper.selectByReconciliationId(recon.getId(), tenantId);
                if (items == null || items.isEmpty()) {
                    if (recon.getDeductionAmount() != null && recon.getDeductionAmount().compareTo(BigDecimal.ZERO) > 0) {
                        recon.setDeductionAmount(BigDecimal.ZERO);
                        BigDecimal total = recon.getTotalAmount() != null ? recon.getTotalAmount() : BigDecimal.ZERO;
                        recon.setFinalAmount(total);
                        shipmentReconciliationService.updateById(recon);
                        fixed++;
                    }
                    continue;
                }

                BigDecimal totalDeduction = BigDecimal.ZERO;
                BigDecimal supplement = BigDecimal.ZERO;
                for (DeductionItem item : items) {
                    BigDecimal amt = item.getDeductionAmount() != null ? item.getDeductionAmount() : BigDecimal.ZERO;
                    if ("SUPPLEMENT".equalsIgnoreCase(item.getDeductionType())) {
                        supplement = supplement.add(amt);
                    } else {
                        totalDeduction = totalDeduction.add(amt);
                    }
                }

                BigDecimal existingDeduction = recon.getDeductionAmount() != null ? recon.getDeductionAmount() : BigDecimal.ZERO;
                BigDecimal total = recon.getTotalAmount() != null ? recon.getTotalAmount() : BigDecimal.ZERO;
                BigDecimal expectedFinal = total.subtract(totalDeduction).add(supplement);
                BigDecimal actualFinal = recon.getFinalAmount() != null ? recon.getFinalAmount() : BigDecimal.ZERO;

                if (existingDeduction.compareTo(totalDeduction) != 0 || actualFinal.compareTo(expectedFinal) != 0) {
                    recon.setDeductionAmount(totalDeduction);
                    recon.setFinalAmount(expectedFinal);
                    shipmentReconciliationService.updateById(recon);
                    fixed++;
                    log.info("[FinanceConsistency] 修复扣款汇总不一致: reconId={}, oldDeduction={}, newDeduction={}, oldFinal={}, newFinal={}",
                            recon.getId(), existingDeduction, totalDeduction, actualFinal, expectedFinal);
                }
            } catch (Exception e) {
                log.warn("[FinanceConsistency] 检查扣款汇总异常: reconId={}", recon.getId(), e);
            }
        }
        return fixed;
    }
}
