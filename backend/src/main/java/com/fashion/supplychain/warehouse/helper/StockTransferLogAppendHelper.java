package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.warehouse.entity.StockTransfer;
import com.fashion.supplychain.warehouse.service.StockTransferService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class StockTransferLogAppendHelper extends AbstractOperationLogAppendHelper<StockTransfer, String> {

    @Autowired
    private StockTransferService stockTransferService;

    @Override
    protected StockTransferService getService() {
        return stockTransferService;
    }

    @Override
    protected String getEntityName() {
        return "库存调拨";
    }

    @Override
    protected Function<StockTransfer, String> getRemarkGetter() {
        return StockTransfer::getRemark;
    }

    @Override
    protected BiConsumer<StockTransfer, String> getRemarkSetter() {
        return StockTransfer::setRemark;
    }

    public void appendCreate(String transferId) {
        appendOperation(transferId, "创建调拨单", null);
    }

    public void appendApprove(String transferId, String reviewer) {
        appendOperation(transferId, "审核通过", "审核人：" + reviewer);
    }

    public void appendReject(String transferId, String reviewer, String reason) {
        appendOperation(transferId, "审核驳回", "审核人：" + reviewer + "，原因：" + reason);
    }

    public void appendTransfer(String transferId, String fromLocation, String toLocation) {
        appendOperation(transferId, "完成调拨", "从：" + fromLocation + "，到：" + toLocation);
    }

    public void appendCancel(String transferId, String reason) {
        appendOperation(transferId, "取消调拨", "原因：" + reason);
    }
}