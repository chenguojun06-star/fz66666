package com.fashion.supplychain.websocket.service;

import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketService {

    private final RealTimeWebSocketHandler webSocketHandler;

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
        log.debug("[WebSocket] notifyScanSuccess: operatorId={}, orderNo={}", operatorId, orderNo);
    }

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
        log.debug("[WebSocket] notifyScanUndo: operatorId={}, orderNo={}", operatorId, orderNo);
    }

    public void notifyOrderProgressChanged(String operatorId, String orderNo, int progress, String currentStage) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.ORDER_PROGRESS_CHANGED,
            Map.of(
                "orderNo", orderNo,
                "progress", progress,
                "currentStage", currentStage,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.debug("[WebSocket] notifyOrderProgressChanged: operatorId={}, orderNo={}", operatorId, orderNo);
    }

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
        webSocketHandler.sendToUser(operatorId, message);
        log.debug("[WebSocket] notifyTaskReceived: operatorId={}, orderNo={}", operatorId, orderNo);
    }

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
        log.debug("[WebSocket] notifyQualityChecked: operatorId={}, orderNo={}", operatorId, orderNo);
    }

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
        log.debug("[WebSocket] notifyProcessStageReceived: operatorId={}, orderNo={}, process={}", operatorId, orderNo, processName);
    }

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
        log.debug("[WebSocket] notifyProcessStageCompleted: operatorId={}, orderNo={}, process={}", operatorId, orderNo, processName);
    }

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
        webSocketHandler.sendToUser(operatorId, message);
        log.debug("[WebSocket] notifyWarehouseIn: operatorId={}, orderNo={}", operatorId, orderNo);
    }

    public void notifyDataChanged(String operatorId, String entityType, String entityId, String action) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.DATA_CHANGED,
            Map.of(
                "entityType", entityType,
                "entityId", entityId,
                "action", action,
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.debug("[WebSocket] notifyDataChanged: operatorId={}, {} {}", operatorId, entityType, action);
    }

    public void notifyScanRealtime(String operatorId, String orderNo, String styleNo,
                                    String stageName, int quantity, String operatorName) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.SCAN_REALTIME,
            Map.of(
                "orderNo", orderNo,
                "styleNo", styleNo,
                "stageName", stageName,
                "quantity", quantity,
                "operatorName", operatorName != null ? operatorName : "",
                "timestamp", System.currentTimeMillis()
            )
        );
        webSocketHandler.sendToUser(operatorId, message);
        log.debug("[WebSocket] notifyScanRealtime: operatorId={}, orderNo={}", operatorId, orderNo);
    }

    public void sendToUser(String userId, WebSocketMessageType type, Object payload) {
        WebSocketMessage<Object> message = WebSocketMessage.create(type, payload);
        webSocketHandler.sendToUser(userId, message);
    }

    public void sendToUserByType(String userId, String clientType, WebSocketMessageType type, Object payload) {
        WebSocketMessage<Object> message = WebSocketMessage.create(type, payload);
        webSocketHandler.sendToUserByType(userId, clientType, message);
    }



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
        log.debug("[WebSocket] notifyApprovalPending: approverId={}, applicant={}, type={}", approverId, applicantName, operationType);
    }

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
        log.debug("[WebSocket] notifyApprovalResult: applicantId={}, type={}, approved={}", applicantId, operationType, approved);
    }

    public void broadcastQualityAnomaly(String operatorId, String orderNo, String processStageName,
                                         double defectRate, String suggestion) {
        WebSocketMessage<Map<String, Object>> message = WebSocketMessage.create(
            WebSocketMessageType.QUALITY_ANOMALY,
            Map.of(
                "orderNo", orderNo,
                "stageName", processStageName,
                "defectRate", defectRate,
                "suggestion", suggestion,
                "timestamp", System.currentTimeMillis()
            )
        );
        if (operatorId != null && !operatorId.isEmpty()) {
            webSocketHandler.sendToUser(operatorId, message);
        }
        log.warn("[WebSocket] broadcastQualityAnomaly: orderNo={}, stage={}, defectRate={}%", orderNo, processStageName, defectRate);
    }

}
