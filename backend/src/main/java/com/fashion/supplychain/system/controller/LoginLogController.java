package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.service.LoginLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 登录日志/操作日志控制器（合并后）
 */
@RestController
@RequestMapping("/api/system/login-log")
@PreAuthorize("isAuthenticated()")
public class LoginLogController {

    @Autowired
    private LoginLogService loginLogService;

    /**
     * 查询登录日志列表
     */
    @PreAuthorize("hasAuthority('MENU_SYSTEM_LOGIN_LOG_VIEW')")
    @GetMapping("/list")
    public Result<?> getLoginLogList(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String loginStatus,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {

        Page<LoginLog> logPage = loginLogService.getLoginLogPage(page, pageSize, username, loginStatus, startDate, endDate);
        return Result.success(logPage);
    }

    /**
     * 查询操作日志列表
     */
    @PreAuthorize("hasAuthority('MENU_SYSTEM_LOGIN_LOG_VIEW')")
    @GetMapping("/operations")
    public Result<?> getOperationLogs(
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) String bizId,
            @RequestParam(required = false) String action) {

        List<LoginLog> logs = loginLogService.listOperationLogs(bizType, bizId, action);
        return Result.success(logs);
    }

    /**
     * 记录操作日志
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/operation")
    public Result<?> recordOperation(
            @RequestParam String bizType,
            @RequestParam String bizId,
            @RequestParam String action,
            @RequestParam String operator,
            @RequestParam(required = false) String remark) {

        loginLogService.recordOperation(bizType, bizId, action, operator, remark);
        return Result.success("操作日志记录成功");
    }
}
