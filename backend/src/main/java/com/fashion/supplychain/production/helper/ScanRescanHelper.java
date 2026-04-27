package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class ScanRescanHelper {

    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionProcessTrackingService processTrackingService;
    @Autowired private CuttingBundleService cuttingBundleService;
    @Autowired private CuttingTaskService cuttingTaskService;
    @Autowired private ProductWarehousingOrchestrator productWarehousingOrchestrator;
    @Autowired private ScanRecordPermissionHelper scanRecordPermissionHelper;
    @Autowired private ScanRecordEnrichHelper scanRecordEnrichHelper;
    @Autowired private DistributedLockService distributedLockService;

    public Map<String, Object> rescan(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        String recordId = TextUtils.safeText(safeParams.get("recordId"));
        if (!hasText(recordId)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        Long tenantId = UserContext.tenantId();
        ScanRecord preCheck = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getId, recordId)
                .eq(ScanRecord::getTenantId, tenantId)
                .one();
        if (preCheck == null) {
            throw new IllegalStateException("未找到扫码记录");
        }
        String rescanOrderId = TextUtils.safeText(preCheck.getOrderId());
        String lockKey = "scan:" + (hasText(rescanOrderId) ? rescanOrderId : ("rescan:" + recordId));
        return distributedLockService.executeWithLock(lockKey, 10, TimeUnit.SECONDS, () -> {
            return doRescan(safeParams, recordId);
        });
    }

    private Map<String, Object> doRescan(Map<String, Object> safeParams, String recordId) {
        Long rescanTenantId = UserContext.tenantId();
        ScanRecord target = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getId, recordId)
                .eq(ScanRecord::getTenantId, rescanTenantId)
                .one();
        if (target == null) {
            throw new IllegalStateException("未找到扫码记录");
        }

        validateRescanPermission(target);

        String scanType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase() : "";
        rollbackWarehousingOnRescan(target, scanType);
        rollbackCuttingOnRescan(target, scanType);

        resetTrackingByScanRecord(target.getId());
        scanRecordService.removeById(target.getId());
        log.info("[rescan] 已删除扫码记录: recordId={}", recordId);

        String orderId = TextUtils.safeText(target.getOrderId());
        if (hasText(orderId)) {
            productionOrderService.recomputeProgressAsync(orderId);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "退回成功，可重新扫码");
        return resp;
    }

    private void validateRescanPermission(ScanRecord target) {
        UserContext ctx = UserContext.get();
        String currentUserId = ctx == null ? null : ctx.getUserId();
        if (!hasText(currentUserId) || !currentUserId.equals(target.getOperatorId())) {
            throw new AccessDeniedException("只能退回自己的扫码记录");
        }

        if (!"success".equalsIgnoreCase(target.getScanResult()) && !"qualified".equalsIgnoreCase(target.getScanResult())) {
            throw new IllegalStateException("只能退回成功的扫码记录");
        }

        assertNotPayrollSettled(target);
        assertNoNextStageScan(target);

        LocalDateTime scanTime = target.getScanTime() != null ? target.getScanTime() : target.getCreateTime();
        if (scanTime != null && scanTime.plusMinutes(30).isBefore(LocalDateTime.now())) {
            throw new IllegalStateException("只能退回30分钟内的扫码记录");
        }

        String rescanOrderId = TextUtils.safeText(target.getOrderId());
        if (hasText(rescanOrderId)) {
            ProductionOrder rescanOrder = scanRecordPermissionHelper.findScopedOrder(rescanOrderId, null);
            if (rescanOrder != null && scanRecordPermissionHelper.isTerminalOrderStatus(rescanOrder.getStatus())) {
                throw new IllegalStateException("订单已关闭或完成，无法退回重扫");
            }
        }
    }

    private void assertNotPayrollSettled(ScanRecord target) {
        if (StringUtils.hasText(target.getPayrollSettlementId())) {
            throw new IllegalStateException("该扫码记录已参与工资结算，无法退回");
        }
    }

    private void assertNoNextStageScan(ScanRecord target) {
        String nextStageType = scanRecordEnrichHelper.getNextStageScanType(target.getScanType());
        if (hasText(nextStageType) && hasText(target.getCuttingBundleId())) {
            long nextCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, target.getOrderId())
                    .eq(ScanRecord::getCuttingBundleId, target.getCuttingBundleId())
                    .eq(ScanRecord::getScanType, nextStageType)
                    .eq(ScanRecord::getScanResult, "success"));
            if (nextCount > 0) {
                throw new IllegalStateException("下一生产环节已完成扫码，无法退回当前记录");
            }
        }
    }

    private void rollbackWarehousingOnRescan(ScanRecord target, String scanType) {
        boolean isWarehouseType = "warehouse".equals(scanType) || "quality".equals(scanType)
                || "quality_warehousing".equalsIgnoreCase(target.getProcessCode());
        if (!isWarehouseType) return;

        String qr = hasText(target.getCuttingBundleQrCode()) ? target.getCuttingBundleQrCode()
                : target.getScanCode();
        int qty = target.getQuantity() != null ? target.getQuantity() : 0;
        if (hasText(qr) && qty > 0) {
            try {
                Map<String, Object> body = new HashMap<>();
                body.put("orderId", target.getOrderId());
                body.put("cuttingBundleQrCode", qr);
                body.put("rollbackQuantity", qty);
                body.put("rollbackRemark", "退回重扫");
                productWarehousingOrchestrator.rollbackByBundle(body);
            } catch (Exception e) {
                log.error("[rescan] 入库回滚失败: recordId={}", target.getId(), e);
                throw new IllegalStateException("入库回滚失败，无法退回重扫: " + e.getMessage(), e);
            }
        }
    }

    private void rollbackCuttingOnRescan(ScanRecord target, String scanType) {
        String reqId = hasText(target.getRequestId()) ? target.getRequestId().trim() : "";
        boolean isCuttingBundled = reqId.startsWith("CUTTING_BUNDLED:");
        boolean isCuttingType = "cutting".equals(scanType)
                || "裁剪".equals(hasText(target.getProgressStage()) ? target.getProgressStage().trim() : "");

        if (!isCuttingBundled && !isCuttingType) return;

        String oid = TextUtils.safeText(target.getOrderId());
        if (!hasText(oid)) return;

        try {
            cuttingBundleService.remove(new LambdaQueryWrapper<CuttingBundle>()
                    .eq(CuttingBundle::getProductionOrderId, oid));
            log.info("[rescan] 已删除裁剪菲号(整批): orderId={}", oid);

            CuttingTask cuttingTask = cuttingTaskService.getOne(new LambdaQueryWrapper<CuttingTask>()
                    .eq(CuttingTask::getProductionOrderId, oid)
                    .last("limit 1"));
            if (cuttingTask != null && "bundled".equalsIgnoreCase(cuttingTask.getStatus())) {
                LambdaUpdateWrapper<CuttingTask> cTaskUw = new LambdaUpdateWrapper<>();
                cTaskUw.eq(CuttingTask::getId, cuttingTask.getId())
                       .set(CuttingTask::getStatus, "received")
                       .set(CuttingTask::getBundledTime, null)
                       .set(CuttingTask::getUpdateTime, LocalDateTime.now());
                cuttingTaskService.update(cTaskUw);
                log.info("[rescan] 裁剪任务状态已退回到received: taskId={}, orderId={}", cuttingTask.getId(), oid);
            }
        } catch (Exception e) {
            log.warn("[rescan] 裁剪数据回滚失败，继续撤销扫码记录: recordId={}, error={}", target.getId(), e.getMessage());
        }
    }

    private void resetTrackingByScanRecord(String scanRecordId) {
        if (!hasText(scanRecordId)) return;
        try {
            ProductionProcessTracking tracking = processTrackingService.getOne(
                    new LambdaQueryWrapper<ProductionProcessTracking>()
                            .eq(ProductionProcessTracking::getScanRecordId, scanRecordId)
                            .last("LIMIT 1"),
                    false);
            if (tracking == null) return;
            if (Boolean.TRUE.equals(tracking.getIsSettled())) {
                log.warn("[resetTracking] 该工序跟踪记录已结算，跳过重置: trackingId={}", tracking.getId());
                return;
            }
            LambdaUpdateWrapper<ProductionProcessTracking> uw = new LambdaUpdateWrapper<>();
            uw.eq(ProductionProcessTracking::getId, tracking.getId())
              .set(ProductionProcessTracking::getScanStatus, "pending")
              .set(ProductionProcessTracking::getScanTime, null)
              .set(ProductionProcessTracking::getScanRecordId, null)
              .set(ProductionProcessTracking::getOperatorId, null)
              .set(ProductionProcessTracking::getOperatorName, null)
              .set(ProductionProcessTracking::getSettlementAmount, null);
            processTrackingService.update(uw);
            log.info("[resetTracking] 工序跟踪已还原为 pending: trackingId={}, 菲号={}, 工序={}",
                    tracking.getId(), tracking.getBundleNo(), tracking.getProcessName());
        } catch (Exception e) {
            log.error("[resetTracking] 重置失败（不影响主流程）: scanRecordId={}", scanRecordId, e);
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
