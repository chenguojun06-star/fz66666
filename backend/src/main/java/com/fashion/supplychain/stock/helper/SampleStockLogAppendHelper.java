package com.fashion.supplychain.stock.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.service.SampleStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class SampleStockLogAppendHelper {

    @Autowired
    private SampleStockService sampleStockService;

    public void appendOperation(String stockId, String action, String detail) {
        if (stockId == null) return;
        OperationLogAppendUtil.appendOperation(
            stockId,
            sampleStockService,
            SampleStock::getRemark,
            SampleStock::setRemark,
            action,
            detail,
            "样衣库存"
        );
    }

    public void appendCreate(String stockId) {
        appendOperation(stockId, "新增样衣", null);
    }

    public void appendUpdate(String stockId, String fieldNames) {
        appendOperation(stockId, "修改样衣", "更新字段：" + fieldNames);
    }

    public void appendLoan(String stockId, String borrower, Integer quantity) {
        appendOperation(stockId, "借出", "借用人：" + borrower + "，数量：" + quantity);
    }

    public void appendReturn(String stockId, String borrower, Integer quantity) {
        appendOperation(stockId, "归还", "归还人：" + borrower + "，数量：" + quantity);
    }

    public void appendTransfer(String stockId, String fromFactory, String toFactory) {
        appendOperation(stockId, "调拨", "从：" + fromFactory + "，到：" + toFactory);
    }

    public void appendScrap(String stockId, String reason) {
        appendOperation(stockId, "报废", "原因：" + reason);
    }
}
