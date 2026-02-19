package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.LoginLog;
import java.util.List;

public interface LoginLogService extends IService<LoginLog> {
    Page<LoginLog> getLoginLogPage(Long page, Long pageSize, String username, String loginStatus, String startDate, String endDate);

    /**
     * 记录操作日志
     */
    void recordOperation(String bizType, String bizId, String action, String operator, String remark);

    /**
     * 记录操作日志（带目标名称）
     */
    void recordOperation(String bizType, String bizId, String targetName, String action, String operator, String remark);

    /**
     * 查询操作日志
     */
    List<LoginLog> listOperationLogs(String bizType, String bizId, String action);
}
