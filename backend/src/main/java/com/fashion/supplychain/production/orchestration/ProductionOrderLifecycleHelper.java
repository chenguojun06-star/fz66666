package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.orchestration.OrderDecisionCaptureOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 生产订单生命周期辅助器 — 删除、报废、关闭
 * 从 ProductionOrderOrchestrator 拆分，降低单文件行数
 */
@Service
@Slf4j
public class ProductionOrderLifecycleHelper {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private MaterialPurchaseService materialPurchaseService;
    @Autowired
    private CuttingTaskService cuttingTaskService;
    @Autowired
    private com.fashion.supplychain.production.service.ScanRecordService scanRecordService;
    @Autowired
    private com.fashion.supplychain.production.service.ProductWarehousingService productWarehousingService;
    @Autowired
    private com.fashion.supplychain.production.service.ProductOutstockService productOutstockService;
    @Autowired
    private com.fashion.supplychain.finance.service.ShipmentReconciliationService shipmentReconciliationService;
    @Autowired
    private com.fashion.supplychain.finance.service.PayrollSettlementService payrollSettlementService;
    @Autowired
    private com.fashion.supplychain.finance.service.PayrollSettlementItemService payrollSettlementItemService;
    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;
    @Autowired(required = false)
    private OperationLogService operationLogService;
    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Autowired
    private ProductionOrderOrchestratorHelper helper;
    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator changeApprovalOrchestrator;
    @Autowired(required = false)
    private OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;
    @Autowired(required = false)
    private OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;

    @Autowired
    private ProductionProcessTrackingService processTrackingService;

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        cascadeCleanupChildTables(oid, existed.getOrderNo());
        return true;
    }

    public Map<String, Object> deleteByIdWithApproval(String id, String reason) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");

        if (changeApprovalOrchestrator != null) {
            Map<String, Object> opData = new HashMap<>();
            opData.put("orderId", oid);
            Map<String, Object> approvalResp = changeApprovalOrchestrator.checkAndCreateIfNeeded(
                    "ORDER_DELETE", oid, existed.getOrderNo(), opData, reason);
            if (approvalResp != null) {
                return approvalResp;
            }
        }
        deleteById(oid);
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", "删除成功");
        return result;
    }

    private void cascadeCleanupChildTables(String orderId, String orderNo) {
        try { materialPurchaseService.deleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete material purchases: orderId={}", orderId, e); }
        try { cuttingTaskService.deleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete cutting tasks: orderId={}", orderId, e); }
        try { scanRecordService.deleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete scan records: orderId={}", orderId, e); }
        try { productWarehousingService.softDeleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete warehousing records: orderId={}", orderId, e); }
        try { productOutstockService.softDeleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete outstock records: orderId={}", orderId, e); }
        try { shipmentReconciliationService.removeByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete shipment reconciliation: orderId={}", orderId, e); }
        try { payrollSettlementItemService.deleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete payroll settlement items: orderId={}", orderId, e); }
        try { payrollSettlementService.deleteByOrderId(orderId); }
        catch (Exception e) { log.warn("Failed to cascade delete payroll settlements: orderId={}", orderId, e); }
        try { processTrackingService.deleteByOrderNo(orderNo); }
        catch (Exception e) { log.warn("Failed to cascade delete process tracking records: orderNo={}", orderNo, e); }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrapOrder(String id, String remark) {
        TenantAssert.assertTenantContext();
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) { throw new IllegalArgumentException("参数错误"); }
        String r = StringUtils.hasText(remark) ? remark.trim() : null;
        if (!StringUtils.hasText(r)) { throw new IllegalArgumentException("remark不能为空"); }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existed.getTenantId(), "生产订单");
        String st = helper.safeText(existed.getStatus()).toLowerCase();
        if ("completed".equals(st)) { throw new IllegalStateException("订单已完成，无法报废"); }

        long receivedCount = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .ne(MaterialPurchase::getStatus, "pending")
                .count();
        if (receivedCount > 0) {
            throw new IllegalStateException("订单已有" + receivedCount + "条已领取的采购记录，无法报废");
        }

        List<MaterialPurchase> pendingList = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderId, oid)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, "pending")
                .list();
        if (!pendingList.isEmpty()) {
            materialPurchaseService.lambdaUpdate()
                    .eq(MaterialPurchase::getOrderId, oid)
                    .eq(MaterialPurchase::getStatus, "pending")
                    .remove();
            log.info("scrapOrder: 订单{}报废，自动作废{}条待领取采购记录", oid, pendingList.size());
        }

        existed.setStatus("scrapped");
        existed.setOperationRemark(r);
        existed.setUpdateTime(LocalDateTime.now());
        boolean ok = productionOrderService.updateById(existed);
        if (!ok) { throw new IllegalStateException("报废失败"); }

        try { scanRecordDomainService.insertOrderOperationRecord(existed, "报废", r, LocalDateTime.now()); }
        catch (Exception e) { log.warn("Failed to log order scrap: orderId={}", oid, e); }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String remark) {
        TenantAssert.assertTenantContext();
        ProductionOrder result = financeOrchestrationService.closeOrder(id);
        try {
            if (operationLogService != null && result != null) {
                OperationLog opLog = new OperationLog();
                opLog.setModule("生产管理");
                opLog.setOperation("关闭订单");
                opLog.setTargetType("生产订单");
                opLog.setTargetId(id);
                opLog.setTargetName(result.getOrderNo());
                opLog.setReason(remark);
                opLog.setOperatorName(UserContext.username());
                try { String uid = UserContext.userId(); if (uid != null) opLog.setOperatorId(Long.parseLong(uid)); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
                opLog.setTenantId(UserContext.tenantId());
                opLog.setOperationTime(LocalDateTime.now());
                opLog.setStatus("success");
                operationLogService.save(opLog);
            }
        } catch (Exception e) {
            log.warn("记录订单关闭操作日志失败: orderId={}", id, e);
        }
        if (result != null && (orderDecisionCaptureOrchestrator != null || orderLearningOutcomeOrchestrator != null)) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            if (orderDecisionCaptureOrchestrator != null) { orderDecisionCaptureOrchestrator.captureByOrderId(result.getId()); }
                            if (orderLearningOutcomeOrchestrator != null) { orderLearningOutcomeOrchestrator.refreshByOrderId(result.getId()); }
                        } catch (Exception ex) { log.warn("order learning close afterCommit sync failed, orderId={}", result.getId(), ex); }
                    }
                }
            );
        }
        return result;
    }
}
