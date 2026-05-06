package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.websocket.service.WebSocketService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ScanBroadcastService {

    @Autowired
    private WebSocketService webSocketService;

    public void broadcastWarehouseScan(String operatorId, String operatorName,
                                       ProductionOrder order, String styleNo,
                                       String bundleNo, String bundleColor, String bundleSize,
                                       int quantity, String warehouse,
                                       String scanRecordId, String scanMode) {
        try {
            String orderNo = safeStr(order.getOrderNo());
            String sn = safeStr(styleNo);
            String bNo = safeStr(bundleNo);
            String bColor = safeStr(bundleColor);
            String bSize = safeStr(bundleSize);
            String opName = safeStr(operatorName);
            String displayAction = "ucode".equals(scanMode) ? "U编码入库" : "入库";

            webSocketService.notifyScanSuccess(operatorId, orderNo, sn, displayAction, quantity, opName, bNo);
            webSocketService.notifyWarehouseIn(operatorId, orderNo, quantity,
                    StringUtils.hasText(warehouse) ? warehouse : "默认仓库");
            webSocketService.notifyOrderProgressChanged(operatorId, orderNo, quantity, "入库");
            webSocketService.notifyDataChanged(operatorId, "ScanRecord", scanRecordId, "create");
            webSocketService.notifyProcessStageCompleted(operatorId, orderNo, "入库", opName, bNo, bColor, bSize, quantity);
        } catch (Exception wsEx) {
            log.warn("[ScanBroadcast] WebSocket broadcast failed (non-blocking): {}", wsEx.getMessage());
        }
    }

    public void broadcastQualityScan(String operatorId, String operatorName,
                                     ProductionOrder order, String bundleNo,
                                     String bundleColor, String bundleSize,
                                     int quantity) {
        try {
            String orderNo = safeStr(order.getOrderNo());
            String bNo = safeStr(bundleNo);
            String bColor = safeStr(bundleColor);
            String bSize = safeStr(bundleSize);
            String opName = safeStr(operatorName);

            webSocketService.notifyQualityChecked(operatorId, orderNo, "质检", quantity, 0, opName, bNo, bColor, bSize);
            webSocketService.notifyOrderProgressChanged(operatorId, orderNo, quantity, "质检");
            webSocketService.notifyDataChanged(operatorId, "ScanRecord", null, "create");
        } catch (Exception wsEx) {
            log.warn("[ScanBroadcast] WebSocket broadcast failed (non-blocking): {}", wsEx.getMessage());
        }
    }

    public void broadcastProcessStage(String operatorId, String operatorName,
                                      ProductionOrder order, String bundleNo,
                                      String bundleColor, String bundleSize,
                                      String processName, int quantity, boolean isCompleted) {
        if (webSocketService == null || order == null) return;
        try {
            String orderNo = safeStr(order.getOrderNo());
            String bNo = safeStr(bundleNo);
            String color = safeStr(bundleColor);
            String size = safeStr(bundleSize);
            String opName = safeStr(operatorName);
            if (isCompleted) {
                webSocketService.notifyProcessStageCompleted(operatorId, orderNo, processName, opName, bNo, color, size, quantity);
            } else {
                webSocketService.notifyProcessStageReceived(operatorId, orderNo, processName, opName, bNo, color, size);
            }
        } catch (Exception e) {
            log.warn("[ScanBroadcast] 工序通知推送失败（不阻断流程）: orderNo={}, process={}", order.getOrderNo(), processName, e);
        }
    }

    private String safeStr(String val) {
        return val != null ? val : "";
    }
}
