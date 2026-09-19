package com.fashion.supplychain.finance.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.helper.ExternalFactoryMaterialDeductionHelper;
import com.fashion.supplychain.production.orchestration.ShipmentReconciliationOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
    private ShipmentReconciliationOrchestrator shipmentReconciliationOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPickingService materialPickingService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    // D-474：收付款闭环自检（补记付款记录 + 补回写上游已付款）
    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired(required = false)
    private org.springframework.scheduling.TaskScheduler taskScheduler;

    // D-474：把最近一次自检结果存 Redis，供页面展示（财务看不到服务器日志）
    @Autowired(required = false)
    private org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    /** 最近一次一致性自检结果的 Redis key */
    public static final String CONSISTENCY_LAST_KEY = "finance:consistency:last";

    /**
     * D-474：启动后延迟 3 分钟自检一次。
     * 背景：容器每次部署都会重建、日志随之清空，6 小时一次的 cron 在部署当天往往
     * 还没触发就又重启了，自愈长期"看不见摸不着"。启动跑一次既让修复尽快生效，
     * 也让巡检是否真的在工作能被立刻验证（日志里能查到 [FinanceConsistency]）。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void runOnceAfterStartup() {
        if (taskScheduler == null) {
            return;
        }
        taskScheduler.schedule(() -> {
            try {
                log.info("[FinanceConsistency] 启动后自检开始");
                checkAndFixFinanceConsistency();
            } catch (Exception e) {
                log.error("[FinanceConsistency] 启动后自检失败", e);
            }
        }, java.time.Instant.now().plusSeconds(180));
    }

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

    void doCheckAndFix() {
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
        int fixedPaymentRecords = 0;
        int fixedMissingReconBills = 0;
        int totalFailed = 0;

        for (Long tenantId : tenantIds) {
            TenantAssert.bindTenantForTask(tenantId, "财务一致性巡检");
            try {
                fixedMissingRecon += fixMissingShipmentReconciliations();
                fixedOrphanDeductions += fixOrphanDeductions();
                fixedDeductionSum += fixDeductionSumMismatch(tenantId);
                // D-474：收付款闭环自检——补推缺失的对账账单、已结清账单缺付款记录/上游未置已付款时自愈
                if (billAggregationOrchestrator != null) {
                    fixedMissingReconBills += billAggregationOrchestrator.repairMissingReconciliationBills();
                    fixedMissingReconBills += billAggregationOrchestrator.repairMissingSecondaryProcessBills();
                    fixedPaymentRecords += billAggregationOrchestrator.repairSettledBillsConsistency();
                }
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
        log.info("[FinanceConsistency] 巡检完成: 补建对账单={}, 补推对账账单={}, 归集孤儿扣款={}, 修复扣款汇总={}, 补记付款记录={}, 失败租户={}, 耗时{}ms",
                fixedMissingRecon, fixedMissingReconBills, fixedOrphanDeductions, fixedDeductionSum, fixedPaymentRecords, totalFailed, duration);
        saveLastResult(fixedMissingRecon, fixedMissingReconBills, fixedOrphanDeductions,
                fixedDeductionSum, fixedPaymentRecords, totalFailed, duration);
    }

    /**
     * D-474：把自检结果写进 Redis，让前端能展示"最近一次数据自检"，
     * 财务不用去翻服务器日志也能知道系统有没有自动修过数据。
     */
    private void saveLastResult(int missingRecon, int missingReconBills, int orphanDeductions,
                                int deductionSum, int paymentRecords, int failedTenants, long durationMs) {
        if (stringRedisTemplate == null) {
            return;
        }
        try {
            int fixedTotal = missingRecon + missingReconBills + orphanDeductions + deductionSum + paymentRecords;
            String json = String.format(
                    "{\"checkedAt\":\"%s\",\"fixedTotal\":%d,\"failedTenants\":%d,\"durationMs\":%d,"
                            + "\"detail\":{\"missingRecon\":%d,\"missingReconBills\":%d,\"orphanDeductions\":%d,"
                            + "\"deductionSum\":%d,\"paymentRecords\":%d}}",
                    java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                    fixedTotal, failedTenants, durationMs,
                    missingRecon, missingReconBills, orphanDeductions, deductionSum, paymentRecords);
            stringRedisTemplate.opsForValue().set(CONSISTENCY_LAST_KEY, json, 7, java.util.concurrent.TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("[FinanceConsistency] 保存自检结果失败（不影响巡检）: {}", e.getMessage());
        }
    }

    int fixMissingShipmentReconciliations() {
        Long tenantId = TenantAssert.currentTenantId();
        List<ProductionOrder> externalOrders = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getFactoryType)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getFactoryType, "EXTERNAL")
                .in(ProductionOrder::getStatus, "production", "completed", "closed")
                .eq(ProductionOrder::getDeleteFlag, 0)
                .list();
        if (externalOrders == null || externalOrders.isEmpty()) return 0;

        int fixed = 0;
        // 批量预加载（修复 N+1 查询）
        Set<String> orderIds = externalOrders.stream()
                .map(ProductionOrder::getId)
                .filter(id -> id != null && !id.isEmpty())
                .collect(Collectors.toSet());

        // 批量查询入库数量：按 orderId 分组统计（保留 tenantId 过滤，P0铁律4）
        Map<String, Long> whCountMap = orderIds.isEmpty()
                ? Collections.emptyMap()
                : productWarehousingService.lambdaQuery()
                        .select(ProductWarehousing::getOrderId)
                        .in(ProductWarehousing::getOrderId, orderIds)
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .eq(ProductWarehousing::getTenantId, tenantId)
                        .list()
                        .stream()
                        .filter(r -> r.getOrderId() != null)
                        .collect(Collectors.groupingBy(ProductWarehousing::getOrderId, Collectors.counting()));

        // 批量查询已存在对账单的 orderId 集合（保留 tenantId 过滤，P0铁律4）
        Set<String> reconOrderIds = orderIds.isEmpty()
                ? Collections.emptySet()
                : new HashSet<>(shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getOrderId)
                        .in(ShipmentReconciliation::getOrderId, orderIds)
                        .eq(ShipmentReconciliation::getTenantId, tenantId)
                        .list()
                        .stream()
                        .map(ShipmentReconciliation::getOrderId)
                        .filter(id -> id != null && !id.isEmpty())
                        .collect(Collectors.toSet()));

        for (ProductionOrder order : externalOrders) {
            try {
                int whQty = whCountMap.getOrDefault(order.getId(), 0L).intValue();
                if (whQty <= 0) continue;

                boolean hasRecon = reconOrderIds.contains(order.getId());
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

    int fixOrphanDeductions() {
        Long tenantId = TenantAssert.currentTenantId();
        List<DeductionItem> orphans = deductionItemMapper.selectList(
                new LambdaQueryWrapper<DeductionItem>()
                        .eq(DeductionItem::getTenantId, tenantId)
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

    int fixDeductionSumMismatch(Long tenantId) {
        List<ShipmentReconciliation> recons = shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .list();
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
