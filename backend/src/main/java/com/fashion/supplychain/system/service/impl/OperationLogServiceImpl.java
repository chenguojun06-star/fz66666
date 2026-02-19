package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.mapper.OperationLogMapper;
import com.fashion.supplychain.system.service.OperationLogService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 操作日志Service实现
 */
@Service
public class OperationLogServiceImpl extends ServiceImpl<OperationLogMapper, OperationLog> implements OperationLogService {

    @Override
    public Page<OperationLog> getOperationLogPage(
            Long page,
            Long pageSize,
            String module,
            String operation,
            String operatorName,
            String targetType,
            String startDate,
            String endDate
    ) {
        Page<OperationLog> logPage = new Page<>(page, pageSize);
        LambdaQueryWrapper<OperationLog> wrapper = new LambdaQueryWrapper<>();

        // 模块筛选
        if (StringUtils.hasText(module)) {
            wrapper.eq(OperationLog::getModule, module);
        }

        // 操作类型筛选
        if (StringUtils.hasText(operation)) {
            wrapper.eq(OperationLog::getOperation, operation);
        }

        // 操作人筛选
        if (StringUtils.hasText(operatorName)) {
            wrapper.like(OperationLog::getOperatorName, operatorName);
        }

        // 目标类型筛选
        if (StringUtils.hasText(targetType)) {
            wrapper.eq(OperationLog::getTargetType, targetType);
        }

        // 时间范围筛选
        if (StringUtils.hasText(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(OperationLog::getOperationTime, startDateTime);
        }

        if (StringUtils.hasText(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(OperationLog::getOperationTime, endDateTime);
        }

        // 租户隔离：非超管只能看本租户的日志
        Long currentTenantId = UserContext.tenantId();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        if (!isSuperAdmin && currentTenantId != null) {
            wrapper.eq(OperationLog::getTenantId, currentTenantId);
        }

        // 按时间倒序排列
        wrapper.orderByDesc(OperationLog::getOperationTime);

        return this.page(logPage, wrapper);
    }

    @Override
    public boolean createOperationLog(OperationLog operationLog) {
        // 设置默认值
        if (operationLog.getOperationTime() == null) {
            operationLog.setOperationTime(LocalDateTime.now());
        }
        if (!StringUtils.hasText(operationLog.getStatus())) {
            operationLog.setStatus("success");
        }

        return this.save(operationLog);
    }
}
