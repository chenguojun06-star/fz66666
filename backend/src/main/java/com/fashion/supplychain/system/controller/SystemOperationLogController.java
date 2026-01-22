package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.SystemOperationLog;
import com.fashion.supplychain.system.service.SystemOperationLogService;
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
    private SystemOperationLogService systemOperationLogService;

    @GetMapping("/list")
    public Result<List<SystemOperationLog>> list(@RequestParam(required = false) String bizType,
            @RequestParam(required = false) String bizId,
            @RequestParam(required = false) String action) {
        return Result.success(systemOperationLogService.listByBiz(bizType, bizId, action));
    }
}
