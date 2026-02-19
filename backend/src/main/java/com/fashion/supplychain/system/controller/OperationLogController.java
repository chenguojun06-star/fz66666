package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 操作日志控制器
 */
@RestController
@RequestMapping("/api/system/operation-log")
@PreAuthorize("isAuthenticated()")
public class OperationLogController {

    @Autowired
    private OperationLogService operationLogService;

    /**
     * 查询操作日志列表（分页）
     */
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('MENU_LOGIN_LOG')")
    public Result<?> getOperationLogList(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize,
            @RequestParam(required = false) String module,
            @RequestParam(required = false) String operation,
            @RequestParam(required = false) String operatorName,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {

        Page<OperationLog> logPage = operationLogService.getOperationLogPage(
                page, pageSize, module, operation, operatorName, targetType, startDate, endDate
        );
        return Result.success(logPage);
    }

    /**
     * 创建操作日志
     */
    @PostMapping
    public Result<?> createOperationLog(@RequestBody OperationLog operationLog) {
        boolean success = operationLogService.createOperationLog(operationLog);
        if (success) {
            return Result.success("操作日志记录成功");
        } else {
            return Result.fail("操作日志记录失败");
        }
    }

    /**
     * 根据ID查询操作日志详情
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('MENU_LOGIN_LOG')")
    public Result<?> getOperationLogById(@PathVariable Long id) {
        OperationLog log = operationLogService.getById(id);
        if (log != null) {
            return Result.success(log);
        } else {
            return Result.fail("操作日志不存在");
        }
    }
}
