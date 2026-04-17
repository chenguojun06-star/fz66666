package com.fashion.supplychain.websocket.service;

import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Map;

/**
 * WebSocket服务类
 * 供业务层调用，发送实时消息
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketService {

    private final RealTimeWebSocketHandler webSocketHandler;

    /**
     * 通知扫码操作人扫码成功（定向推送，不全局广播）
     */
    public void notifyScanSuccess(String operatorId, String orderNo, String styleNo,
                                   String processName, int quantity, String operatorName, String bundleNo) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_SUCCESS,
            Map.of(
                "orderNo", orderNo,
                "styleNo", styleNo,
                "processName", processName,
                "quantity", quantity,
                "operatorName", operatorName != null ? operatorName : "",
                "bundleNo", bundleNo != null ? bundleNo : "",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.info("[WebSocket] 通知扫码成功: operatorId={}, orderNo={}, quantity={}", operatorId, orderNo, quantity);
    }

    /**
     * 通知扫码操作人撤销结果（定向推送，不全局广播）
     */
    public void notifyScanUndo(String operatorId, String orderNo, String recordId,
                                String operatorName, String processName, String bundleNo) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_UNDO,
            Map.of(
                "orderNo", orderNo,
                "recordId", recordId,
                "operatorName", operatorName != null ? operatorName : "",
                "processName", processName != null ? processName : "",
                "bundleNo", bundleNo != null ? bundleNo : "",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.info("[WebSocket] 通知扫码撤销: operatorId={}, orderNo={}, recordId={}", operatorId, orderNo, recordId);
    }

    /**
     * 广播订单状态变更
     */
    public void broadcastOrderStatusChanged(String orderNo, String oldStatus, String newStatus) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.ORDER_STATUS_CHANGED,
            Map.of(
                "orderNo", orderNo,
                "oldStatus", oldStatus,
                "newStatus", newStatus,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 广播订单状态变更: orderNo={}, {} -> {}", orderNo, oldStatus, newStatus);
    }

    /**
     * 广播订单进度变更
     */
    public void broadcastOrderProgressChanged(String orderNo, int progress, String currentStage) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.ORDER_PROGRESS_CHANGED,
            Map.of(
                "orderNo", orderNo,
                "progress", progress,
                "currentStage", currentStage,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 广播订单进度变更: orderNo={}, progress={}%", orderNo, progress);
    }

    /**
     * 通知操作人任务领取（定向推送，不全局广播）
     */
    public void notifyTaskReceived(String operatorId, String orderNo, String taskId, String workerId, String workerName) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.TASK_RECEIVED,
            Map.of(
                "orderNo", orderNo,
                "taskId", taskId,
                "workerId", workerId,
                "workerName", workerName,
                "timestamp", System.currentTimeMillis()
            )
        );
        if (operatorId != null && !operatorId.isEmpty()) {
            webSocketHandler.sendToUser(operatorId, message);
        } else {
            webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        }
    }

    /**
     * 广播任务领取（兼容旧调用，全局广播）
     * @deprecated 使用 notifyTaskReceived(operatorId, ...) 替代
     */
    @Deprecated
    public void broadcastTaskReceived(String orderNo, String taskId, String workerId, String workerName) {
        notifyTaskReceived(null, orderNo, taskId, workerId, workerName);
    }

    /**
     * 通知操作人质检完成（定向推送，不全局广播）
     */
    public void notifyQualityChecked(String operatorId, String orderNo, String checkResult,
                                      int qualifiedQty, int unqualifiedQty, String operatorName,
                                      String bundleNo, String color, String size) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.QUALITY_CHECKED,
            Map.of(
                "orderNo", orderNo,
                "checkResult", checkResult,
                "qualifiedQty", qualifiedQty,
                "unqualifiedQty", unqualifiedQty,
                "operatorName", operatorName != null ? operatorName : "",
                "bundleNo", bundleNo != null ? bundleNo : "",
                "color", color != null ? color : "",
                "size", size != null ? size : "",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.info("[WebSocket] 通知质检完成: operatorId={}, orderNo={}, result={}", operatorId, orderNo, checkResult);
    }

    /**
     * 通知操作人工序领取（定向推送，不全局广播）
     */
    public void notifyProcessStageReceived(String operatorId, String orderNo, String processName, String operatorName,
                                               String bundleNo, String color, String size) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.PROCESS_STAGE_RECEIVED,
            Map.of(
                "orderNo", orderNo,
                "processName", processName,
                "operatorName", operatorName,
                "bundleNo", bundleNo,
                "color", color != null ? color : "",
                "size", size != null ? size : "",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.info("[WebSocket] 通知工序领取: operatorId={}, orderNo={}, process={}, operator={}", operatorId, orderNo, processName, operatorName);
    }

    /**
     * 通知操作人工序完成（定向推送，不全局广播）
     */
    public void notifyProcessStageCompleted(String operatorId, String orderNo, String processName, String operatorName,
                                                String bundleNo, String color, String size, int quantity) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.PROCESS_STAGE_COMPLETED,
            Map.of(
                "orderNo", orderNo,
                "processName", processName,
                "operatorName", operatorName,
                "bundleNo", bundleNo,
                "color", color != null ? color : "",
                "size", size != null ? size : "",
                "quantity", quantity,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.info("[WebSocket] 通知工序完成: operatorId={}, orderNo={}, process={}, operator={}, qty={}", operatorId, orderNo, processName, operatorName, quantity);
    }

    /**
     * 通知操作人入库操作（定向推送，不全局广播）
     */
    public void notifyWarehouseIn(String operatorId, String orderNo, int quantity, String warehouseLocation) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.WAREHOUSE_IN,
            Map.of(
                "orderNo", orderNo,
                "quantity", quantity,
                "warehouseLocation", warehouseLocation,
                "timestamp", System.currentTimeMillis()
            )
        );
        if (operatorId != null && !operatorId.isEmpty()) {
            webSocketHandler.sendToUser(operatorId, message);
        } else {
            webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        }
    }

    /**
     * 广播入库操作（兼容旧调用，全局广播）
     * @deprecated 使用 notifyWarehouseIn(operatorId, ...) 替代
     */
    @Deprecated
    public void broadcastWarehouseIn(String orderNo, int quantity, String warehouseLocation) {
        notifyWarehouseIn(null, orderNo, quantity, warehouseLocation);
    }

    /**
     * 广播通用数据变更
     */
    public void broadcastDataChanged(String entityType, String entityId, String action) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.DATA_CHANGED,
            Map.of(
                "entityType", entityType,
                "entityId", entityId,
                "action", action,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 广播数据变更: {} {} {}", entityType, entityId, action);
    }

    /**
     * 发送消息给指定用户
     */
    public void sendToUser(String userId, WebSocketMessageType type, Object payload) {
        WebSocketMessage<Object> message = WebSocketMessage.create(type, payload);
        webSocketHandler.sendToUser(userId, message);
    }

    /**
     * 发送消息给指定用户的指定客户端类型
     */
    public void sendToUserByType(String userId, String clientType, WebSocketMessageType type, Object payload) {
        WebSocketMessage<Object> message = WebSocketMessage.create(type, payload);
        webSocketHandler.sendToUserByType(userId, clientType, message);
    }

    /**
     * 广播支付通知（发给收款方）
     */
    public void broadcastPaymentNotification(String event, String payeeId, String payeeName,
                                              BigDecimal amount, String paymentMethod, String paymentNo) {
        WebSocketMessageType type = "payment:created".equals(event)
            ? WebSocketMessageType.PAYMENT_CREATED
            : WebSocketMessageType.PAYMENT_SUCCESS;

        Map<String, Object> payload = Map.of(
            "payeeId", payeeId,
            "payeeName", payeeName,
            "amount", amount,
            "paymentMethod", paymentMethod,
            "paymentNo", paymentNo,
            "timestamp", System.currentTimeMillis()
        );

        // 尝试定向推送给收款方
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(type, payload);
        webSocketHandler.sendToUser(payeeId, message);
        // 同时广播给管理端
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 支付通知: event={}, payee={}, amount={}, no={}", event, payeeName, amount, paymentNo);
    }

    /**
     * 通知租户主账号有新的工人注册申请
     *
     * @param tenantOwnerId 租户主账号 userId（字符串形式）
     * @param workerName    注册工人姓名
     */
    public void notifyWorkerRegistrationPending(String tenantOwnerId, String workerName) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.WORKER_REGISTRATION_PENDING,
            Map.of(
                "workerName", workerName,
                "message", "新工人注册申请待审批：" + workerName,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(tenantOwnerId, message);
        log.info("[WebSocket] 通知租户主账号新注册申请: ownerId={}, workerName={}", tenantOwnerId, workerName);
    }

    /**
     * 通知超级管理员有新的工厂入驻申请
     *
     * @param superAdminId 超管 userId（字符串形式）
     * @param tenantName   申请工厂名称
     */
    public void notifyTenantApplicationPending(String superAdminId, String tenantName) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.TENANT_APPLICATION_PENDING,
            Map.of(
                "tenantName", tenantName,
                "message", "新工厂入驻申请待审批：" + tenantName,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(superAdminId, message);
        log.info("[WebSocket] 通知超管新工厂入驻申请: adminId={}, tenantName={}", superAdminId, tenantName);
    }

    /**
     * 通知超级管理员有新的应用商店购买订单
     *
     * @param superAdminId 超管 userId（字符串形式）
     * @param tenantName   下单客户名称
     * @param appName      应用名称
     * @param orderNo      订单号
     */
    public void notifyAppOrderPending(String superAdminId, String tenantName, String appName, String orderNo) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.APP_ORDER_PENDING,
            Map.of(
                "tenantName", tenantName,
                "appName", appName,
                "orderNo", orderNo,
                "message", "新购买订单：" + tenantName + " 购买 " + appName,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(superAdminId, message);
        log.info("[WebSocket] 通知超管新应用订单: adminId={}, tenant={}, app={}, orderNo={}",
                superAdminId, tenantName, appName, orderNo);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 审批流推送
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 通知审批人有新的待审批申请
     *
     * @param approverId    审批人 userId
     * @param approverName  审批人姓名
     * @param applicantName 申请人姓名
     * @param operationType 操作类型（ORDER_DELETE / STYLE_DELETE 等）
     * @param targetNo      业务单号
     * @param reason        申请原因
     */
    public void notifyApprovalPending(String approverId, String approverName,
                                       String applicantName, String operationType,
                                       String targetNo, String reason) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.APPROVAL_PENDING,
            Map.of(
                "applicantName", applicantName != null ? applicantName : "",
                "operationType", operationType != null ? operationType : "",
                "targetNo", targetNo != null ? targetNo : "",
                "reason", reason != null ? reason : "",
                "message", "【" + (applicantName != null ? applicantName : "员工") + "】提交了"
                    + (operationType != null ? operationType : "操作") + "审批申请，请及时处理",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(approverId, message);
        log.info("[WebSocket] 审批通知→审批人: approverId={}, applicant={}, type={}, target={}",
                approverId, applicantName, operationType, targetNo);
    }

    /**
     * 通知申请人审批结果（通过/驳回）
     *
     * @param applicantId   申请人 userId
     * @param operationType 操作类型
     * @param targetNo      业务单号
     * @param approved      是否通过
     * @param approverName  审批人姓名
     * @param remark        审批备注
     */
    public void notifyApprovalResult(String applicantId, String operationType,
                                      String targetNo, boolean approved,
                                      String approverName, String remark) {
        String resultText = approved ? "通过" : "驳回";
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.APPROVAL_RESULT,
            Map.of(
                "operationType", operationType != null ? operationType : "",
                "targetNo", targetNo != null ? targetNo : "",
                "approved", approved,
                "approverName", approverName != null ? approverName : "",
                "remark", remark != null ? remark : "",
                "message", "您的" + (operationType != null ? operationType : "操作")
                    + "申请已被【" + (approverName != null ? approverName : "主管") + "】" + resultText,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(applicantId, message);
        log.info("[WebSocket] 审批结果→申请人: applicantId={}, type={}, target={}, approved={}",
                applicantId, operationType, targetNo, approved);
    }

    /**
     * 广播 AI 质检异常预警（租户内广播）
     */
    public void broadcastQualityAnomaly(String orderNo, String processStageName,
                                         double defectRate, String suggestion) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.QUALITY_ANOMALY,
            Map.of(
                "orderNo",       orderNo,
                "stageName",     processStageName,
                "defectRate",    defectRate,
                "suggestion",    suggestion,
                "timestamp",     System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.warn("[WebSocket] 质检异常预警: orderNo={}, stage={}, defectRate={}%",
                orderNo, processStageName, defectRate);
    }

    /**
     * 通知操作人实时扫码播报（定向推送，不全局广播）
     */
    public void broadcastScanRealtime(String operatorId, String orderNo, String styleNo,
                                       String stageName, int quantity, String operatorName) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_REALTIME,
            Map.of(
                "orderNo",      orderNo,
                "styleNo",      styleNo,
                "stageName",    stageName,
                "quantity",     quantity,
                "operatorName", operatorName != null ? operatorName : "",
                "timestamp",    System.currentTimeMillis()
            )
        );
        if (operatorId != null && !operatorId.isEmpty()) {
            webSocketHandler.sendToUser(operatorId, message);
        } else {
            webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        }
    }

    /**
     * 广播实时扫码播报（兼容旧调用，全局广播）
     * @deprecated 使用 broadcastScanRealtime(operatorId, ...) 替代
     */
    @Deprecated
    public void broadcastScanRealtime(String orderNo, String styleNo,
                                       String stageName, int quantity, String operatorName) {
        broadcastScanRealtime(null, orderNo, styleNo, stageName, quantity, operatorName);
    }

    /**
     * 广播刷新所有数据
     */
    public void broadcastRefreshAll(String reason) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.REFRESH_ALL,
            Map.of(
                "reason", reason,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 广播刷新所有: reason={}", reason);
    }

    /**
     * 推送 AI 智能决策卡片 (TraceableAdvice) 给指定租户的所有用户
     */
    public void broadcastTraceableAdvice(Long tenantId, Object adviceCard) {
        WebSocketMessage<Object> message = WebSocketMessage.create(
            WebSocketMessageType.TRACEABLE_ADVICE,
            adviceCard
        );
        // 为了演示，这里直接全站广播，实际应用中可以给 RealTimeWebSocketHandler 增加 broadcastToTenant 方法
        webSocketHandler.broadcastToTenant(UserContext.tenantId(), message);
        log.info("[WebSocket] 已向租户 {} 推送小云智能决策卡片", tenantId);
    }
}
