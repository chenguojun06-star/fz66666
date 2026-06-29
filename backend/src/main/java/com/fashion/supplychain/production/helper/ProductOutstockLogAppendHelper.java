package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ProductOutstockLogAppendHelper {

    @Autowired
    private ProductOutstockService productOutstockService;

    public void appendOperation(String outstockId, String action, String detail) {
        if (outstockId == null) return;
        OperationLogAppendUtil.appendOperation(
            outstockId,
            productOutstockService,
            ProductOutstock::getRemark,
            ProductOutstock::setRemark,
            action,
            detail,
            "成品出库"
        );
    }

    public void appendCreate(String outstockId) {
        appendOperation(outstockId, "创建出库单", null);
    }

    public void appendUpdate(String outstockId, String fieldNames) {
        appendOperation(outstockId, "修改出库单", "更新字段：" + fieldNames);
    }

    public void appendOutstock(String outstockId, Integer quantity) {
        appendOperation(outstockId, "确认出库", "出库数量：" + quantity);
    }

    public void appendCancel(String outstockId, String reason) {
        appendOperation(outstockId, "取消出库", "原因：" + reason);
    }
}
