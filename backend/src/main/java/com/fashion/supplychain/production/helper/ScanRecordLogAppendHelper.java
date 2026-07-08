package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ScanRecordLogAppendHelper {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    public void appendScan(String scanRecordId, String scanType, String bundleNo, String result) {
        if (scanRecordId == null || scanRecordId.trim().isEmpty()) return;
        String id = scanRecordId.trim();

        String typeLabel = formatScanType(scanType);
        String resultLabel = "success".equalsIgnoreCase(result) ? "成功" : "失败";
        String detail = typeLabel + "扫码" + resultLabel;

        OperationLogAppendUtil.appendOperation(
            id,
            scanRecordService,
            ScanRecord::getRemark,
            ScanRecord::setRemark,
            typeLabel + "扫码",
            detail,
            "扫码记录"
        );

        syncScanRecordToOrder(id, typeLabel + "扫码", detail);
    }

    public void appendUndo(String orderId, String scanType, String bundleNo, String undoType) {
        String typeLabel = formatScanType(scanType);
        String detail = "撤回" + typeLabel + "扫码记录（菲号" + bundleNo + "）";
        appendOrderLog(orderId, "扫码撤回", detail);
    }

    public void appendRescan(String orderId, String scanType, String scanCode) {
        String typeLabel = formatScanType(scanType);
        String detail = "重新扫码：" + scanCode;
        appendOrderLog(orderId, "重新扫码", detail);
    }

    private void appendOrderLog(String orderId, String action, String detail) {
        if (orderId == null || orderId.trim().isEmpty()) return;
        try {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (order == null) return;
            orderRemarkHelper.append(order, action, detail);
        } catch (Exception e) {
            log.debug("[ScanLog] 写订单备注失败（不阻断）: orderId={}, action={}, err={}",
                    orderId, action, e.getMessage());
        }
    }

    private void syncScanRecordToOrder(String scanRecordId, String action, String detail) {
        try {
            ScanRecord sr = scanRecordService.getById(scanRecordId);
            if (sr == null) return;
            String orderId = sr.getOrderId();
            if (orderId == null || orderId.trim().isEmpty()) return;
            ProductionOrder order = productionOrderService.getById(orderId);
            if (order == null) return;

            String bundleNo = sr.getCuttingBundleNo() != null ? String.valueOf(sr.getCuttingBundleNo()) : null;
            String processName = sr.getProcessName();
            String stageName = sr.getProgressStage();
            String operatorName = sr.getOperatorName();

            StringBuilder richDetail = new StringBuilder();
            if (operatorName != null && !operatorName.isEmpty()) {
                richDetail.append(operatorName).append(" ");
            }
            richDetail.append("完成").append(" ");
            if (stageName != null && !stageName.isEmpty() && !"其他".equals(stageName)) {
                richDetail.append(stageName).append(" · ");
            }
            if (processName != null && !processName.isEmpty()) {
                richDetail.append(processName).append(" ");
            }
            if (bundleNo != null && !bundleNo.isEmpty()) {
                richDetail.append("菲号").append(bundleNo);
            }

            orderRemarkHelper.append(order, action, richDetail.toString());
        } catch (Exception e) {
            log.debug("[ScanLog] 同步到订单备注失败（不阻断）: scanRecordId={}, action={}, err={}",
                    scanRecordId, action, e.getMessage());
        }
    }

    private String formatScanType(String scanType) {
        if (scanType == null || scanType.isEmpty()) return "扫码";
        switch (scanType.toLowerCase()) {
            case "production": return "生产";
            case "cutting": return "裁剪";
            case "quality": return "质检";
            case "warehouse": return "入库";
            case "outsource": return "外协";
            case "secondary": return "二次工艺";
            default: return scanType;
        }
    }
}
