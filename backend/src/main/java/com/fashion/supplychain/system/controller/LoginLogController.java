package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.service.LoginLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 登录日志控制器
 */
@RestController
@RequestMapping("/api/system/login-log")
public class LoginLogController {

    @Autowired
    private LoginLogService loginLogService;

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
}
