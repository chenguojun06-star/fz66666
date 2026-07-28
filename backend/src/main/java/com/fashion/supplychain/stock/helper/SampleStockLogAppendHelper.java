package com.fashion.supplychain.stock.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.service.SampleStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class SampleStockLogAppendHelper extends AbstractOperationLogAppendHelper<SampleStock, String> {

    @Autowired
    private SampleStockService sampleStockService;

    @Override
    protected SampleStockService getService() {
        return sampleStockService;
    }

    @Override
    protected String getEntityName() {
        return "样衣库存";
    }

    @Override
    protected Function<SampleStock, String> getRemarkGetter() {
        return SampleStock::getRemark;
    }

    @Override
    protected BiConsumer<SampleStock, String> getRemarkSetter() {
        return SampleStock::setRemark;
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