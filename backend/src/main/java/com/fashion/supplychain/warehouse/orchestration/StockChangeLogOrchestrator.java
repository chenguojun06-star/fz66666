package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class StockChangeLogOrchestrator {

    private final StockChangeLogService changeLogService;

    public Result<Page<StockChangeLog>> list(int page, int pageSize, String changeType,
                                              String stockType, String bizType,
                                              String startDate, String endDate, String keyword) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<StockChangeLog> qw = new LambdaQueryWrapper<>();
        qw.eq(StockChangeLog::getTenantId, tenantId);

        if (StringUtils.isNotBlank(changeType)) {
            qw.eq(StockChangeLog::getChangeType, changeType);
        }
        if (StringUtils.isNotBlank(stockType)) {
            qw.eq(StockChangeLog::getStockType, stockType);
        }
        if (StringUtils.isNotBlank(bizType)) {
            qw.eq(StockChangeLog::getBizType, bizType);
        }
        if (StringUtils.isNotBlank(startDate)) {
            qw.ge(StockChangeLog::getCreateTime, startDate + " 00:00:00");
        }
        if (StringUtils.isNotBlank(endDate)) {
            qw.le(StockChangeLog::getCreateTime, endDate + " 23:59:59");
        }
        if (StringUtils.isNotBlank(keyword)) {
            qw.and(w -> w.like(StockChangeLog::getChangeNo, keyword)
                    .or().like(StockChangeLog::getMaterialCode, keyword)
                    .or().like(StockChangeLog::getStyleNo, keyword)
                    .or().like(StockChangeLog::getBizNo, keyword));
        }
        qw.orderByDesc(StockChangeLog::getCreateTime);

        Page<StockChangeLog> result = changeLogService.page(new Page<>(page, pageSize), qw);
        return Result.success(result);
    }

    public void logChange(String changeType, String stockType, String stockId,
                          String materialCode, String styleNo, String color, String size,
                          String locationCode, BigDecimal beforeQty, BigDecimal changeQty,
                          BigDecimal afterQty, String unit, String bizType, String bizId,
                          String bizNo, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();

        StockChangeLog logEntry = new StockChangeLog();
        logEntry.setChangeType(changeType);
        logEntry.setStockType(stockType);
        logEntry.setStockId(stockId);
        logEntry.setMaterialCode(materialCode);
        logEntry.setStyleNo(styleNo);
        logEntry.setColor(color);
        logEntry.setSize(size);
        logEntry.setLocationCode(locationCode);
        logEntry.setBeforeQuantity(beforeQty);
        logEntry.setChangeQuantity(changeQty);
        logEntry.setAfterQuantity(afterQty);
        logEntry.setUnit(unit);
        logEntry.setBizType(bizType);
        logEntry.setBizId(bizId);
        logEntry.setBizNo(bizNo);
        logEntry.setOperatorId(operatorId);
        logEntry.setOperatorName(operatorName);
        logEntry.setRemark(remark);
        logEntry.setTenantId(tenantId);
        logEntry.setCreateTime(LocalDateTime.now());

        changeLogService.save(logEntry);
    }
}
