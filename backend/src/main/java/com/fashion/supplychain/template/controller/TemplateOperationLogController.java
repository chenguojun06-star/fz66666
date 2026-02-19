package com.fashion.supplychain.template.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.template.entity.TemplateOperationLog;
import com.fashion.supplychain.template.service.TemplateOperationLogService;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/template-library/operation-log")
@PreAuthorize("isAuthenticated()")
public class TemplateOperationLogController {

    @Autowired
    private TemplateOperationLogService templateOperationLogService;

    @GetMapping("/list")
    public Result<List<TemplateOperationLog>> list(@RequestParam String templateId,
            @RequestParam(required = false) String action) {
        return Result.success(templateOperationLogService.listByTemplateId(templateId, action));
    }
}
