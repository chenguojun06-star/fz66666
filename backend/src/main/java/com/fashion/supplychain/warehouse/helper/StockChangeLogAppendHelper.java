package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class StockChangeLogAppendHelper extends AbstractOperationLogAppendHelper<StockChangeLog, Long> {

    @Autowired
    private StockChangeLogService stockChangeLogService;

    @Override
    protected StockChangeLogService getService() {
        return stockChangeLogService;
    }

    @Override
    protected String getEntityName() {
        return "库存变动";
    }

    @Override
    protected Function<StockChangeLog, String> getRemarkGetter() {
        return StockChangeLog::getRemark;
    }

    @Override
    protected BiConsumer<StockChangeLog, String> getRemarkSetter() {
        return StockChangeLog::setRemark;
    }
}