package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderFinanceOrchestrationService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PayrollSettlementOrchestrator payrollSettlementOrchestrator;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired(required = false)
    private WebhookPushService webhookPushService;

    @Autowired(required = false)
    private IntelligencePredictionLogMapper intelligencePredictionLogMapper;

    @Autowired
    private DeliverySlaOrchestrator deliverySlaOrchestrator;

    @Autowired
    private ShipmentReconciliationOrchestrator shipmentReconciliationOrchestrator;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        assertCompletePermission();
        String oid = assertValidOrderId(id);
        ProductionOrder order = loadOrderForComplete(oid);
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) throw new IllegalStateException("订单数量异常，无法结单");

        BigDecimal tp = normalizeTolerance(tolerancePercent);
        long qualifiedSum = sumQualifiedWarehousing(oid);
        if (qualifiedSum <= 0) throw new IllegalStateException("该订单合格入库数量为0，无法结单");

        assertPackagingComplete(oid, qualifiedSum);
        assertQuantityWithinTolerance(qualifiedSum, orderQty, tp);

        markOrderCompleted(oid, qualifiedSum, order.getStatus());
        pushCompletionWebhook(order, qualifiedSum, orderQty);
        backfillPredictionLogs(oid);
        triggerPayrollSettlementGeneration(oid);
        return true;
    }

    private void assertCompletePermission() {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限完成订单，需要主管及以上权限");
        }
    }

    private String assertValidOrderId(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) throw new IllegalArgumentException("订单ID不能为空");
        return oid;
    }

    private ProductionOrder loadOrderForComplete(String oid) {
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(st)) throw new IllegalArgumentException("订单已终态(" + st + ")");
        return order;
    }

    private BigDecimal normalizeTolerance(BigDecimal tolerancePercent) {
        if (tolerancePercent == null) return BigDecimal.valueOf(0.05);
        if (tolerancePercent.compareTo(BigDecimal.ZERO) < 0) return BigDecimal.ZERO;
        if (tolerancePercent.compareTo(BigDecimal.ONE) > 0) return BigDecimal.ONE;
        return tolerancePercent;
    }

    private long sumQualifiedWarehousing(String oid) {
        return productWarehousingService.sumQualifiedByOrderId(oid);
    }

    private void assertPackagingComplete(String oid, long qualifiedSum) {
        try {
            long packagingCount = productWarehousingService.lambdaQuery()
                    .eq(com.fashion.supplychain.production.entity.ProductWarehousing::getOrderId, oid)
                    .eq(com.fashion.supplychain.production.entity.ProductWarehousing::getDeleteFlag, 0)
                    .count();
            if (packagingCount > 0 && packagingCount < qualifiedSum) {
                log.warn("[FinanceOrch] 包装未全部完成: orderId={}, packaging={}, qualified={}", oid, packagingCount, qualifiedSum);
            }
        } catch (Exception e) {
            log.warn("[FinanceOrch] 包装完成度检查异常，不影响结单: orderId={}", oid, e);
        }
    }

    private void assertQuantityWithinTolerance(long qualifiedSum, int orderQty, BigDecimal tp) {
        BigDecimal qualified = BigDecimal.valueOf(qualifiedSum);
        BigDecimal required = BigDecimal.valueOf(orderQty);
        BigDecimal minRequired = required.multiply(BigDecimal.ONE.subtract(tp));
        if (qualified.compareTo(minRequired) < 0) {
            throw new IllegalStateException(
                String.format("合格入库数量(%d)未达到容差要求(订单数%d×(1-%s)=%s)",
                    qualifiedSum, orderQty, tp.toPlainString(), minRequired.setScale(0, java.math.RoundingMode.UP)));
        }
    }

    private void markOrderCompleted(String oid, long qualifiedSum, String previousStatus) {
        ProductionOrder update = new ProductionOrder();
        update.setId(oid);
        update.setStatus("completed");
        update.setCompletedQuantity((int) qualifiedSum);
        update.setActualEndDate(LocalDateTime.now());
        update.setUpdateTime(LocalDateTime.now());
        productionOrderService.updateById(update);
        log.info("[FinanceOrch] 订单已标记完成: orderId={}, qualifiedSum={}, previousStatus={}", oid, qualifiedSum, previousStatus);
        if (orderLearningOutcomeOrchestrator != null) {
            try { orderLearningOutcomeOrchestrator.refreshByOrderId(oid); } catch (Exception ex) {
                log.warn("[FinanceOrch] 订单学习结果刷新失败: orderId={}", oid, ex);
            }
        }
    }

    private void pushCompletionWebhook(ProductionOrder order, long qualifiedSum, int orderQty) {
        if (webhookPushService == null) return;
        try {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("styleNo", order.getStyleNo());
            details.put("orderQty", orderQty);
            details.put("qualifiedQty", qualifiedSum);
            webhookPushService.pushOrderStatusChange(order.getOrderNo(), "producing", "completed", details);
        } catch (Exception e) {
            log.warn("[FinanceOrch] 推送完成Webhook失败: orderId={}", order.getId(), e);
        }
    }

    private void backfillPredictionLogs(String oid) {
        if (intelligencePredictionLogMapper == null) return;
        try {
            ProductionOrder order = productionOrderService.getById(oid);
            LocalDateTime finishTime = LocalDateTime.now();
            Long tenantId = order != null ? order.getTenantId() : null;
            if (tenantId != null) {
                intelligencePredictionLogMapper.backfillByOrderId(oid, finishTime, tenantId);
            }
        } catch (Exception e) {
            log.warn("[FinanceOrch] 回填预测日志失败，不影响结单: orderId={}", oid, e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id) {
        return closeOrder(id, false);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, boolean specialClose) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) throw new IllegalArgumentException("订单ID不能为空");

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("closed".equals(st) || "已关闭".equals(st)) {
            return order;
        }
        if (!"completed".equals(st) && !specialClose) {
            throw new IllegalStateException("订单未完成，无法关单。当前状态: " + st);
        }

        int cuttingQty = resolveCuttingQuantity(oid, order);
        int warehousingQualified = resolveWarehousingQualified(oid, order);

        if (!specialClose) {
            assertCloseQuantitySufficient(cuttingQty, warehousingQualified, order);
        }

        markOrderClosed(oid, warehousingQualified);
        executePostCloseActions(oid, order);
        return productionOrderService.getById(oid);
    }

    private int resolveCuttingQuantity(String oid, ProductionOrder order) {
        try {
            List<CuttingBundle> bundles = cuttingBundleMapper.selectList(
                new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, oid));
            return bundles == null ? 0 : bundles.stream()
                .mapToInt(b -> b.getQuantity() == null ? 0 : b.getQuantity())
                .sum();
        } catch (Exception e) {
            log.warn("[FinanceOrch] 解析裁剪数量失败: orderId={}", oid, e);
            return 0;
        }
    }

    private int resolveWarehousingQualified(String oid, ProductionOrder order) {
        try {
            return productWarehousingService.sumQualifiedByOrderId(oid);
        } catch (Exception e) {
            log.warn("[FinanceOrch] 解析入库合格数失败: orderId={}", oid, e);
            return 0;
        }
    }

    private void assertCloseQuantitySufficient(int cuttingQty, int warehousingQualified, ProductionOrder order) {
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) return;
        if (warehousingQualified < orderQty) {
            log.warn("[FinanceOrch] 入库合格数({}) < 订单数({}), 允许关单(容差范围内): orderId={}",
                warehousingQualified, orderQty, order.getId());
        }
    }

    private void markOrderClosed(String oid, int warehousingQualified) {
        ProductionOrder update = new ProductionOrder();
        update.setId(oid);
        update.setStatus("closed");
        update.setCompletedQuantity(warehousingQualified > 0 ? warehousingQualified : null);
        update.setUpdateTime(LocalDateTime.now());
        productionOrderService.updateById(update);
        log.info("[FinanceOrch] 订单已关闭: orderId={}", oid);
    }

    private void executePostCloseActions(String oid, ProductionOrder order) {
        try {
            shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(oid);
        } catch (Exception e) {
            log.warn("[FinanceOrch] 关单后确保出货对账单失败(不阻断关单): orderId={}", oid, e);
        }

        try {
            ProductionOrder refreshed = productionOrderService.getById(oid);
            deliverySlaOrchestrator.computeAndPersistSla(refreshed);
        } catch (Exception ex) {
            log.warn("[交付SLA] 计算失败，不影响关单流程: orderId={}", oid, ex);
        }

        triggerPayrollSettlementGeneration(oid);
    }

    public List<Map<String, Object>> batchCloseOrders(List<String> orderIds, String sourceModule, String remark, boolean specialClose) {
        List<Map<String, Object>> results = new ArrayList<>();
        for (String oid : orderIds) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("orderId", oid);
            try {
                ProductionOrder result = transactionTemplate.execute(status -> {
                    try {
                        return closeOrder(oid, specialClose);
                    } catch (Exception e) {
                        status.setRollbackOnly();
                        throw new RuntimeException(e.getMessage(), e);
                    }
                });
                item.put("success", true);
                item.put("orderNo", result != null ? result.getOrderNo() : oid);
            } catch (Exception e) {
                item.put("success", false);
                String reason = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
                item.put("reason", reason);
                log.warn("批量关单失败: orderId={}, reason={}", oid, reason);
            }
            results.add(item);
        }
        return results;
    }

    public boolean ensureFinanceRecordsForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
        int qty = productWarehousingService.sumQualifiedByOrderId(oid);
        if (qty > 0) {
            try {
                shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(oid);
            } catch (Exception e) {
                log.warn("ensureFinanceRecordsForOrder: 确保出货对账单时异常（不阻断入库）orderId={}, error={}",
                        oid, e.getMessage());
            }
            return true;
        }
        return false;
    }

    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        return shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .and(w -> w.gt(ProductionOrder::getCompletedQuantity, 0).or().eq(ProductionOrder::getStatus,
                        "completed"))
                .orderByDesc(ProductionOrder::getUpdateTime)
                .last("LIMIT 5000")
                .list();
        if (orders == null || orders.isEmpty()) {
            return 0;
        }

        int touched = 0;
        LocalDateTime now = LocalDateTime.now();
        for (ProductionOrder o : orders) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            int qty = o.getCompletedQuantity() == null ? 0 : o.getCompletedQuantity();
            if (qty <= 0) {
                qty = productWarehousingService.sumQualifiedByOrderId(o.getId());
            }
            if (qty <= 0) {
                continue;
            }
            try {
                shipmentReconciliationOrchestrator.ensureShipmentReconciliationForOrder(o.getId());
            } catch (Exception e) {
                log.warn("Failed to ensure shipment reconciliation during backfill: orderId={}", o.getId(), e);
                scanRecordDomainService.insertOrchestrationFailure(
                        o,
                        "ensureShipmentReconciliation",
                        e == null ? "ensureShipmentReconciliation failed"
                                : ("ensureShipmentReconciliation failed: " + e.getMessage()),
                        now);
            }
            touched++;
        }
        return touched;
    }

    private void triggerPayrollSettlementGeneration(String orderId) {
        try {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        java.util.Map<String, Object> params = new java.util.HashMap<>();
                        params.put("orderId", orderId);
                        payrollSettlementOrchestrator.generate(params);
                        log.info("[计件薪资] 订单 {} 关单成功，已自动生成相关计件工资结算单", orderId);
                    } catch (IllegalStateException e) {
                        log.info("[计件薪资] 订单 {} 无可结算记录，跳过生成工资单 ({})", orderId, e.getMessage());
                    } catch (Exception e) {
                        log.error("[计件薪资] 订单 {} 自动生成工资单失败: {}", orderId, e.getMessage(), e);
                    }
                }
            });
        } catch (Exception e) {
            log.error("[计件薪资] 注册后置任务失败 订单 {}", orderId, e);
        }
    }
}
