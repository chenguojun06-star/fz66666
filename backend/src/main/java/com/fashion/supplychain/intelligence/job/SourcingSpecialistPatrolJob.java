package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SmartSourcingService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class SourcingSpecialistPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    @Lazy
    private SmartSourcingService smartSourcingService;

    /**
     * 跨模块读取采购数据（只读）。
     * required=false：采购模块未部署时跳过采购超期检测。
     */
    @Autowired(required = false)
    private MaterialPurchaseService materialPurchaseService;

    @Scheduled(cron = "0 30 */6 * * ?")
    public void patrol() {
        log.info("[SourcingSpecialist] ===== 开始采购专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "sourcing-specialist",
                        "采购专家：物料缺口识别+供应商交付评估");

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> lowMaterial = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .gt(ProductionOrder::getMaterialArrivalRate, 0)
                        .lt(ProductionOrder::getMaterialArrivalRate, 60)
                        .last("LIMIT 20")
                        .list();

                if (!lowMaterial.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String orderList = lowMaterial.stream()
                            .map(o -> o.getOrderNo() + "(物料" + o.getMaterialArrivalRate() + "%)")
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("采购专家：发现%d个物料缺口订单(到位率<60%%): %s",
                            lowMaterial.size(), orderList);
                    patrolOrchestrator.createAction("SOURCING_SPECIALIST_JOB", issue, "MATERIAL_GAP",
                            "MEDIUM", "order", orderList,
                            "{\"action\":\"material_gap_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL");
                } else if (!lowMaterial.isEmpty()) {
                    log.debug("[SourcingSpecialist] 租户 {} 巡检自动执行开关未开启，跳过创建工单", tenantId);
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料缺口识别：发现%d个物料不足订单", lowMaterial.size()),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                Map<String, Long> factoryOrderCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getFactoryName)
                        .list().stream()
                        .filter(o -> o.getFactoryName() != null)
                        .collect(Collectors.groupingBy(ProductionOrder::getFactoryName, Collectors.counting()));

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_supplier_scorecard",
                        String.format("供应商评估：扫描%d个工厂的交付情况", factoryOrderCount.size()),
                        System.currentTimeMillis() - s2, true);

                long s3 = System.currentTimeMillis();
                // 串联智能采购：发现物料缺口后自动生成采购建议推到购物车
                // 仅在租户开启巡检自动执行时触发，失败不阻塞巡检主流程
                int sourcingPushed = 0;
                if (!lowMaterial.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    AtomicInteger pushed = new AtomicInteger(0);
                    for (ProductionOrder order : lowMaterial) {
                        try {
                            withTenantContext(tenantId, () -> {
                                smartSourcingService.generateSourcingForOrder(tenantId, order.getOrderNo());
                            });
                            pushed.incrementAndGet();
                        } catch (Exception e) {
                            log.warn("[SourcingSpecialist] 租户{}订单{}生成智能采购建议失败(不阻断): {}",
                                    tenantId, order.getOrderNo(), e.getMessage());
                        }
                    }
                    sourcingPushed = pushed.get();
                }
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_procurement",
                        String.format("采购建议：基于%d个物料缺口订单生成采购建议，成功推送%d个",
                                lowMaterial.size(), sourcingPushed),
                        System.currentTimeMillis() - s3, true);

                // ── 4. 采购单超期检测（PURCHASE_OVERDUE）：预计到货时间已过但未完成 ──
                long s4 = System.currentTimeMillis();
                int purchaseOverdueCount = 0;
                if (materialPurchaseService != null) {
                    try {
                        LocalDateTime now = LocalDateTime.now();
                        LambdaQueryWrapper<MaterialPurchase> overdueQ = new LambdaQueryWrapper<>();
                        overdueQ.eq(MaterialPurchase::getTenantId, tenantId)
                                .eq(MaterialPurchase::getDeleteFlag, 0)
                                .notIn(MaterialPurchase::getStatus, "completed", "cancelled")
                                .isNotNull(MaterialPurchase::getExpectedArrivalDate)
                                .lt(MaterialPurchase::getExpectedArrivalDate, now)
                                .last("LIMIT 50");
                        List<MaterialPurchase> overduePurchases = materialPurchaseService.list(overdueQ);
                        boolean patrolEnabled = isPatrolEnabledForTenant(tenantId);
                        for (MaterialPurchase p : overduePurchases) {
                            if (p.getExpectedArrivalDate() == null) continue;
                            long overdueDays = ChronoUnit.DAYS.between(p.getExpectedArrivalDate(), now);
                            if (overdueDays <= 0) continue;
                            purchaseOverdueCount++;
                            if (!patrolEnabled) continue;
                            String orderLabel = p.getOrderNo() != null ? p.getOrderNo()
                                    : (p.getPurchaseNo() != null ? p.getPurchaseNo() : p.getId());
                            String issue = String.format("采购单[%s] 已超过预计到货时间 %d 天",
                                    orderLabel, overdueDays);
                            patrolOrchestrator.createAction("SOURCING_SPECIALIST_JOB", issue, "PURCHASE_OVERDUE",
                                    "MEDIUM", "purchase", String.valueOf(p.getId()),
                                    "{\"action\":\"purchase_overdue_alert\",\"purchaseId\":\"" + p.getId() + "\"}",
                                    BigDecimal.valueOf(0.75), "NEED_APPROVAL");
                        }
                        if (!patrolEnabled && purchaseOverdueCount > 0) {
                            log.debug("[SourcingSpecialist] 租户 {} 巡检自动执行开关未开启，跳过创建 {} 个采购超期工单",
                                    tenantId, purchaseOverdueCount);
                        }
                    } catch (Exception ex) {
                        log.warn("[SourcingSpecialist] 租户 {} 采购单超期检测异常: {}", tenantId, ex.getMessage());
                    }
                }
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_purchase_overdue",
                        String.format("采购超期检测：发现%d个超期未到货采购单", purchaseOverdueCount),
                        System.currentTimeMillis() - s4, true);

                finishAndSnapshot(tenantId, commandId, "sourcing-specialist", "采购专家",
                        String.format("采购专家巡检完成，发现%d个物料缺口，%d个超期采购单",
                                lowMaterial.size(), purchaseOverdueCount),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SourcingSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SourcingSpecialist] ===== 巡检完成 =====");
    }
}