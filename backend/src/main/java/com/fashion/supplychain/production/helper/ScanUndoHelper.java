package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class ScanUndoHelper {

    private static final Set<String> ADMIN_ROLE_KEYWORDS = Set.of("admin", "ADMIN", "manager", "supervisor", "主管", "管理员");

    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionProcessTrackingService processTrackingService;
    @Autowired private CuttingTaskService cuttingTaskService;
    @Autowired private ProductWarehousingOrchestrator productWarehousingOrchestrator;
    @Autowired private DuplicateScanPreventer duplicateScanPreventer;
    @Autowired private ScanRecordPermissionHelper scanRecordPermissionHelper;
    @Autowired private ScanRecordEnrichHelper scanRecordEnrichHelper;
    @Autowired private DistributedLockService distributedLockService;
    @Autowired private WebSocketService webSocketService;

    public Map<String, Object> undo(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);

        String orderNo = TextUtils.safeText(safeParams.get("orderNo"));
        String orderId = TextUtils.safeText(safeParams.get("orderId"));
        String lockKey = "scan:" + (hasText(orderNo) ? orderNo : (hasText(orderId) ? orderId : "undo"));
        Map<String, Object> result = distributedLockService.executeWithLock(lockKey, 10, TimeUnit.SECONDS, () -> {
            return doUndo(safeParams);
        });

        broadcastUndoNotification(safeParams);
        return result;
    }

    private Map<String, Object> doUndo(Map<String, Object> safeParams) {
        String recordId = TextUtils.safeText(safeParams.get("recordId"));
        String requestId = TextUtils.safeText(safeParams.get("requestId"));
        String scanCode = TextUtils.safeText(safeParams.get("scanCode"));
        String scanType = TextUtils.safeText(safeParams.get("scanType"));
        String progressStage = TextUtils.safeText(safeParams.get("progressStage"));
        String processCode = TextUtils.safeText(safeParams.get("processCode"));
        Integer qtyParam = NumberUtils.toInt(safeParams.get("quantity"));

        if (!hasText(recordId) && !hasText(requestId) && !hasText(scanCode)) {
            throw new IllegalArgumentException("参数错误");
        }

        ScanRecord target = findUndoTarget(recordId, requestId, scanCode, scanType, progressStage, processCode);

        if (target == null) {
            return handleUndoTargetNotFound(safeParams, scanType, scanCode, qtyParam);
        }

        validateUndoPermission(target);

        String targetType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase()
                : (hasText(scanType) ? scanType.trim().toLowerCase() : "");
        boolean warehousingLike = "warehouse".equals(targetType) || "quality".equals(targetType)
                || "quality_warehousing".equalsIgnoreCase(target.getProcessCode());

        if (warehousingLike) {
            return undoWarehousingScan(target, scanCode, qtyParam);
        }

        return undoNormalScan(target);
    }

    private ScanRecord findUndoTarget(String recordId, String requestId, String scanCode, String scanType,
                                       String progressStage, String processCode) {
        ScanRecord target = null;
        if (hasText(recordId)) {
            Long tenantId = UserContext.tenantId();
            target = scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getId, recordId)
                    .eq(ScanRecord::getTenantId, tenantId)
                    .one();
        }
        if (target == null && hasText(requestId)) {
            target = duplicateScanPreventer.findByRequestId(requestId);
        }
        if (target == null && hasText(scanCode)) {
            UserContext ctx = UserContext.get();
            String operatorId = ctx == null ? null : ctx.getUserId();
            Long tenantId = UserContext.tenantId();
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getScanCode, scanCode)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime)
                    .last("limit 1");
            qw.eq(ScanRecord::getTenantId, tenantId);
            if (hasText(scanType)) qw.eq(ScanRecord::getScanType, scanType);
            if (hasText(operatorId)) qw.eq(ScanRecord::getOperatorId, operatorId);
            if (hasText(progressStage)) qw.eq(ScanRecord::getProgressStage, progressStage);
            if (hasText(processCode)) qw.eq(ScanRecord::getProcessCode, processCode);
            try {
                target = scanRecordService.getOne(qw);
            } catch (Exception e) {
                log.warn("[ScanUndoHelper] 查询扫码记录失败: recordId={}", recordId, e);
                target = null;
            }
        }
        return target;
    }

    private Map<String, Object> handleUndoTargetNotFound(Map<String, Object> safeParams, String scanType,
                                                          String scanCode, Integer qtyParam) {
        String st = hasText(scanType) ? scanType.trim().toLowerCase() : "";
        if ("warehouse".equals(st)) {
            throw new IllegalStateException("入库记录不支持直接撤回，请先走出库，再重新入库");
        }
        if ("quality".equals(st) && hasText(scanCode) && qtyParam != null && qtyParam > 0) {
            String fallbackOrderId = TextUtils.safeText(safeParams.get("orderId"));
            if (hasText(fallbackOrderId)) {
                ProductionOrder fallbackOrder = scanRecordPermissionHelper.findScopedOrder(fallbackOrderId, null);
                if (fallbackOrder == null) {
                    throw new AccessDeniedException("无权操作该订单");
                }
                if (scanRecordPermissionHelper.isTerminalOrderStatus(fallbackOrder.getStatus())) {
                    throw new IllegalStateException("订单已关闭或完成，无法撤回扫码记录");
                }
            }
            Map<String, Object> body = new HashMap<>();
            body.put("orderId", fallbackOrderId);
            body.put("cuttingBundleQrCode", scanCode);
            body.put("rollbackQuantity", qtyParam);
            body.put("rollbackRemark", "撤销扫码");
            boolean ok = productWarehousingOrchestrator.rollbackByBundle(body);
            Map<String, Object> resp = new HashMap<>();
            resp.put("success", ok);
            resp.put("message", "已撤销");
            return resp;
        }
        throw new IllegalStateException("未找到可撤销记录");
    }

    private void validateUndoPermission(ScanRecord target) {
        scanRecordPermissionHelper.assertUndoRecordPermission(target);

        if (!"success".equalsIgnoreCase(target.getScanResult())) {
            throw new IllegalStateException("记录已失效");
        }

        assertNotPayrollSettled(target);
        assertNoNextStageScan(target);

        String undoScanType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase() : "";
        boolean isCuttingScan = "cutting".equals(undoScanType)
                || "裁剪".equals(hasText(target.getProgressStage()) ? target.getProgressStage().trim() : "");
        if (isCuttingScan) {
            assertCuttingUndoPermission(target);
        }

        assertUndoTimeLimit(target);

        String orderId = TextUtils.safeText(target.getOrderId());
        if (hasText(orderId)) {
            ProductionOrder order = scanRecordPermissionHelper.findScopedOrder(orderId, null);
            if (order == null) {
                throw new AccessDeniedException("无权操作该订单");
            }
            if (scanRecordPermissionHelper.isTerminalOrderStatus(order.getStatus())) {
                throw new IllegalStateException("订单已关闭或完成，无法撤回扫码记录");
            }
        }

        String targetType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase() : "";
        if ("warehouse".equals(targetType)) {
            throw new IllegalStateException("入库记录不支持直接撤回，请先走出库，再重新入库");
        }
    }

    private void assertNotPayrollSettled(ScanRecord target) {
        if (StringUtils.hasText(target.getPayrollSettlementId())) {
            throw new IllegalStateException("该扫码记录已参与工资结算，无法撤回");
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
                throw new IllegalStateException("下一生产环节已完成扫码，无法撤回当前记录");
            }
        }
    }

    private void assertCuttingUndoPermission(ScanRecord target) {
        UserContext cutCtx = UserContext.get();
        if (isAdminRole(cutCtx)) return;

        String cutOrderId = TextUtils.safeText(target.getOrderId());
        if (hasText(cutOrderId)) {
            CuttingTask cuttingTask = cuttingTaskService.getOne(new LambdaQueryWrapper<CuttingTask>()
                    .eq(CuttingTask::getProductionOrderId, cutOrderId)
                    .last("limit 1"));
            if (cuttingTask != null && "bundled".equalsIgnoreCase(cuttingTask.getStatus())) {
                throw new IllegalStateException("裁剪已完成分扎，普通人员无法撤回，请联系管理员处理");
            }
        }
    }

    private void assertUndoTimeLimit(ScanRecord target) {
        LocalDateTime scanTime = target.getScanTime() != null ? target.getScanTime() : target.getCreateTime();
        if (scanTime == null) return;

        UserContext timeCtx = UserContext.get();
        boolean isAdmin = isAdminRole(timeCtx);
        boolean undoExpired = isAdmin
                ? scanTime.plusHours(5).isBefore(LocalDateTime.now())
                : scanTime.plusMinutes(30).isBefore(LocalDateTime.now());
        if (undoExpired) {
            throw new IllegalStateException(isAdmin
                    ? "只能撤回5小时内的扫码记录（管理员权限）"
                    : "只能撤回30分钟内的扫码记录，如需撤回请联系管理员");
        }
    }

    private Map<String, Object> undoWarehousingScan(ScanRecord target, String scanCode, Integer qtyParam) {
        String qr = hasText(target.getCuttingBundleQrCode()) ? target.getCuttingBundleQrCode()
                : (hasText(target.getScanCode()) ? target.getScanCode() : scanCode);
        int qty = target.getQuantity() == null ? 0 : target.getQuantity();
        if (qty <= 0 && qtyParam != null) {
            qty = qtyParam;
        }
        if (!hasText(qr) || qty <= 0) {
            throw new IllegalArgumentException("撤销参数错误");
        }
        Map<String, Object> body = new HashMap<>();
        body.put("orderId", target.getOrderId());
        body.put("cuttingBundleQrCode", qr);
        body.put("rollbackQuantity", qty);
        body.put("rollbackRemark", "撤销扫码");
        boolean ok = productWarehousingOrchestrator.rollbackByBundle(body);

        resetTrackingByScanRecord(target.getId());
        scanRecordService.removeById(target.getId());
        log.info("[undo] 已删除扫码记录: recordId={}", target.getId());

        String oid = TextUtils.safeText(target.getOrderId());
        if (hasText(oid)) {
            productionOrderService.recomputeProgressAsync(oid);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", ok);
        resp.put("message", "已撤销");
        return resp;
    }

    private Map<String, Object> undoNormalScan(ScanRecord target) {
        resetTrackingByScanRecord(target.getId());
        scanRecordService.removeById(target.getId());
        log.info("[undo] 已删除扫码记录: recordId={}", target.getId());

        String oid = TextUtils.safeText(target.getOrderId());
        if (hasText(oid)) {
            productionOrderService.recomputeProgressAsync(oid);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "已撤销");
        return resp;
    }

    private void broadcastUndoNotification(Map<String, Object> safeParams) {
        try {
            String orderNo = TextUtils.safeText(safeParams.get("orderNo"));
            if (!hasText(orderNo)) orderNo = TextUtils.safeText(safeParams.get("_resolvedOrderNo"));
            String undoOperatorId = UserContext.userId();
            String undoOperatorName = UserContext.username();
            String undoProcessName = TextUtils.safeText(safeParams.get("processName"));
            String undoBundleNo = TextUtils.safeText(safeParams.get("bundleNo"));
            if (hasText(undoOperatorId)) {
                webSocketService.notifyScanUndo(undoOperatorId, orderNo, TextUtils.safeText(safeParams.get("scanType")),
                        undoOperatorName, undoProcessName, undoBundleNo);
            }
            webSocketService.notifyDataChanged(undoOperatorId, "ScanRecord", null, "delete");
            broadcastUndoProgressNotification(undoOperatorId, orderNo, safeParams);
        } catch (Exception wsEx) {
            log.warn("[Undo] WebSocket broadcast failed (non-blocking): {}", wsEx.getMessage());
        }
    }

    private void broadcastUndoProgressNotification(String undoOperatorId, String orderNo, Map<String, Object> safeParams) {
        if (!hasText(orderNo)) return;
        try {
            String oid = TextUtils.safeText(safeParams.get("orderId"));
            if (!hasText(oid)) oid = TextUtils.safeText(safeParams.get("_resolvedOrderId"));
            if (hasText(oid)) {
                ProductionOrder po = productionOrderService.getById(oid);
                int curProgress = po != null && po.getProductionProgress() != null ? po.getProductionProgress() : 0;
                webSocketService.notifyOrderProgressChanged(undoOperatorId, orderNo, curProgress, "撤销");
            } else {
                webSocketService.notifyOrderProgressChanged(undoOperatorId, orderNo, 0, "撤销");
            }
        } catch (Exception e) {
            log.warn("[ScanUndoHelper] 进度查询失败，降级通知: orderNo={}", orderNo, e);
            webSocketService.notifyOrderProgressChanged(undoOperatorId, orderNo, 0, "撤销");
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

    private boolean isAdminRole(UserContext ctx) {
        if (ctx == null) return false;
        String role = ctx.getRole();
        if (role == null) return false;
        for (String keyword : ADMIN_ROLE_KEYWORDS) {
            if (role.contains(keyword)) return true;
        }
        return false;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
