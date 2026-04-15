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
    public Result<List<StyleOperationLog>> list(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) String action) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.success(java.util.Collections.emptyList());
        }
        return Result.success(styleOperationLogService.listByStyleId(resolvedStyleId, bizType, action));
    }
}
