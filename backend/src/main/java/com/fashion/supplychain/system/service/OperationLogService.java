package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.OperationLog;

/**
 * 操作日志Service
 */
public interface OperationLogService extends IService<OperationLog> {

    /**
     * 分页查询操作日志
     *
     * @param page 页码
     * @param pageSize 每页条数
     * @param module 模块
     * @param operation 操作类型
     * @param operatorName 操作人
     * @param targetType 目标类型
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @return 分页数据
     */
    Page<OperationLog> getOperationLogPage(
            Long page,
            Long pageSize,
            String module,
            String operation,
            String operatorName,
            String targetType,
            String startDate,
            String endDate
    );

    /**
     * 创建操作日志
     *
     * @param operationLog 操作日志
     * @return 是否成功
     */
    boolean createOperationLog(OperationLog operationLog);
}
