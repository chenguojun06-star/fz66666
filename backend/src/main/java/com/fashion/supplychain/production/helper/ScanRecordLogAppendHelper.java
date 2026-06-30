package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 扫码记录操作日志追加
 * P0铁律#6: 操作日志必须记录关键业务操作
 */
@Component
public class ScanRecordLogAppendHelper {

    @Autowired
    private ScanRecordService scanRecordService;

    private void appendOperation(String recordId, String action, String detail) {
        if (recordId == null || recordId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            recordId.trim(),
            scanRecordService,
            ScanRecord::getRemark,
            ScanRecord::setRemark,
            action,
            detail,
            "扫码记录"
        );
    }

    public void appendScan(String recordId, String scanType, String bundleNo, String result) {
        String detail = "扫码类型：" + scanType + "，菲号：" + bundleNo + "，结果：" + result;
        appendOperation(recordId, "扫码", detail);
    }

    public void appendUndo(String recordId, String scanType, String bundleNo, String undoType) {
        String detail = "撤回类型：" + undoType + "，扫码类型：" + scanType + "，菲号：" + bundleNo;
        appendOperation(recordId, "扫码撤回", detail);
    }

    public void appendRescan(String recordId, String scanType, String scanCode) {
        String detail = "扫码类型：" + scanType + "，码：" + scanCode;
        appendOperation(recordId, "重新扫码", detail);
    }
}
