package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 扫码记录操作日志追加
 * P0铁律#6: 操作日志必须记录关键业务操作
 * 双写策略：ScanRecord.remark + ProductionOrder.remarks（用户要求所有操作记录都进订单备注时间线）
 */
@Slf4j
@Component
public class ScanRecordLogAppendHelper {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    /**
     * 扫码成功后写日志：ScanRecord 仍存在，可双写
     * @param scanRecordId ScanRecord 的 id
     */
    public void appendScan(String scanRecordId, String scanType, String bundleNo, String result) {
        if (scanRecordId == null || scanRecordId.trim().isEmpty()) return;
        String id = scanRecordId.trim();
        String detail = "扫码类型：" + scanType + "，菲号：" + bundleNo + "，结果：" + result;
        // 1. 写 ScanRecord.remark
        OperationLogAppendUtil.appendOperation(
            id,
            scanRecordService,
            ScanRecord::getRemark,
            ScanRecord::setRemark,
            "扫码",
            detail,
            "扫码记录"
        );
        // 2. 同步到 ProductionOrder.remarks（基于 ScanRecord 查 orderId）
        syncScanRecordToOrder(id, "扫码", detail);
    }

    /**
     * 撤回扫码后写日志：ScanRecord 已被删除，无法再查，需直接传 orderId
     * 只写 ProductionOrder.remarks + t_order_remark（双写由 OrderRemarkHelper 完成）
     */
    public void appendUndo(String orderId, String scanType, String bundleNo, String undoType) {
        String detail = "撤回类型：" + undoType + "，扫码类型：" + scanType + "，菲号：" + bundleNo;
        appendOrderLog(orderId, "扫码撤回", detail);
    }

    /**
     * 退回重扫后写日志：ScanRecord 已被删除，需直接传 orderId
     */
    public void appendRescan(String orderId, String scanType, String scanCode) {
        String detail = "扫码类型：" + scanType + "，码：" + scanCode;
        appendOrderLog(orderId, "重新扫码", detail);
    }

    /**
     * 直接写 ProductionOrder.remarks（用于 ScanRecord 已被删除的场景）
     */
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

    /**
     * 通过 ScanRecord id 查到 orderId，再写 ProductionOrder.remarks
     */
    private void syncScanRecordToOrder(String scanRecordId, String action, String detail) {
        try {
            ScanRecord sr = scanRecordService.getById(scanRecordId);
            if (sr == null) return;
            String orderId = sr.getOrderId();
            if (orderId == null || orderId.trim().isEmpty()) return;
            ProductionOrder order = productionOrderService.getById(orderId);
            if (order == null) return;
            // 拼上菲号+工序，方便在订单备注时间线中识别
            String richDetail = detail;
            Integer bundleNoInt = sr.getCuttingBundleNo();
            String bundleNo = bundleNoInt == null ? null : String.valueOf(bundleNoInt);
            String processName = sr.getProgressStage();
            StringBuilder extra = new StringBuilder();
            if (bundleNo != null && !bundleNo.isEmpty()) extra.append("菲号").append(bundleNo).append("，");
            if (processName != null && !processName.isEmpty()) extra.append("工序").append(processName);
            if (extra.length() > 0) {
                richDetail = detail + "（" + extra + "）";
            }
            orderRemarkHelper.append(order, action, richDetail);
        } catch (Exception e) {
            log.debug("[ScanLog] 同步到订单备注失败（不阻断）: scanRecordId={}, action={}, err={}",
                    scanRecordId, action, e.getMessage());
        }
    }
}
