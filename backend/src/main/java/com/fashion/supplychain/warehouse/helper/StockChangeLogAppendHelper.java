package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class StockChangeLogAppendHelper {

    @Autowired
    private StockChangeLogService stockChangeLogService;

    public void appendOperation(Long logId, String action, String detail) {
        OperationLogAppendUtil.appendOperation(
            logId,
            stockChangeLogService,
            StockChangeLog::getRemark,
            StockChangeLog::setRemark,
            action,
            detail,
            "库存变动"
        );
    }
}
