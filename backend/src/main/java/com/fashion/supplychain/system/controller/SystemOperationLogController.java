package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.service.LoginLogService;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/operation-log")
public class SystemOperationLogController {

    @Autowired
    private LoginLogService loginLogService;

    @GetMapping("/list")
    public Result<List<LoginLog>> list(@RequestParam(required = false) String bizType,
            @RequestParam(required = false) String bizId,
            @RequestParam(required = false) String action) {
        return Result.success(loginLogService.listOperationLogs(bizType, bizId, action));
    }
}
