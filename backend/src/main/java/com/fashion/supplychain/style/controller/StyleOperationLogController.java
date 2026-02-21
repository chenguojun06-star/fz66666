package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/style/operation-log")
@PreAuthorize("isAuthenticated()")
public class StyleOperationLogController {

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    @GetMapping("/list")
    public Result<List<StyleOperationLog>> list(@RequestParam Long styleId,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) String action) {
        return Result.success(styleOperationLogService.listByStyleId(styleId, bizType, action));
    }
}
