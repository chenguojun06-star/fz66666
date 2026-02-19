package com.fashion.supplychain.websocket.service;

import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
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
     * 广播扫码成功消息
     */
    public void broadcastScanSuccess(String orderNo, String styleNo, String processName, int quantity) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_SUCCESS,
            Map.of(
                "orderNo", orderNo,
                "styleNo", styleNo,
                "processName", processName,
                "quantity", quantity,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播扫码成功: orderNo={}, quantity={}", orderNo, quantity);
    }

    /**
     * 广播扫码撤销消息
     */
    public void broadcastScanUndo(String orderNo, String recordId) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_UNDO,
            Map.of(
                "orderNo", orderNo,
                "recordId", recordId,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播扫码撤销: orderNo={}, recordId={}", orderNo, recordId);
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
        webSocketHandler.broadcast(message);
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
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播订单进度变更: orderNo={}, progress={}%", orderNo, progress);
    }

    /**
     * 广播任务领取
     */
    public void broadcastTaskReceived(String orderNo, String taskId, String workerId, String workerName) {
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
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播任务领取: orderNo={}, worker={}", orderNo, workerName);
    }

    /**
     * 广播质检完成
     */
    public void broadcastQualityChecked(String orderNo, String checkResult, int qualifiedQty, int unqualifiedQty) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.QUALITY_CHECKED,
            Map.of(
                "orderNo", orderNo,
                "checkResult", checkResult,
                "qualifiedQty", qualifiedQty,
                "unqualifiedQty", unqualifiedQty,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播质检完成: orderNo={}, result={}", orderNo, checkResult);
    }

    /**
     * 广播入库操作
     */
    public void broadcastWarehouseIn(String orderNo, int quantity, String warehouseLocation) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.WAREHOUSE_IN,
            Map.of(
                "orderNo", orderNo,
                "quantity", quantity,
                "warehouseLocation", warehouseLocation,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播入库: orderNo={}, quantity={}", orderNo, quantity);
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
        webSocketHandler.broadcast(message);
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
        webSocketHandler.broadcast(message);
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
        webSocketHandler.broadcast(message);
        log.info("[WebSocket] 广播刷新所有: reason={}", reason);
    }
}
