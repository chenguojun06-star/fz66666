package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.FieldConfigSaveRequest;
import com.fashion.supplychain.system.entity.FieldConfig;
import com.fashion.supplychain.system.orchestration.FieldConfigOrchestrator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 字段配置 API
 * - GET  /api/system/field-config?bizType=style&platform=pc  查询当前租户某业务的字段配置
 * - PUT  /api/system/field-config                            全量保存字段配置（租户管理员）
 * - DEL  /api/system/field-config?bizType=style&fieldKey=xxx 删除自定义字段
 */
@RestController
@RequestMapping("/api/system/field-config")
@PreAuthorize("isAuthenticated()")
public class FieldConfigController {

    @Autowired
    private FieldConfigOrchestrator fieldConfigOrchestrator;

    @GetMapping
    public Result<List<FieldConfig>> list(
            @RequestParam String bizType,
            @RequestParam(defaultValue = "pc") String platform,
            @RequestParam(defaultValue = "false") boolean includeDisabled) {
        return Result.success(fieldConfigOrchestrator.listByBizType(bizType, platform, includeDisabled));
    }

    @PutMapping
    public Result<List<FieldConfig>> save(@RequestBody FieldConfigSaveRequest request) {
        return Result.success(fieldConfigOrchestrator.saveBatch(request));
    }

    @DeleteMapping
    public Result<Void> delete(
            @RequestParam String bizType,
            @RequestParam String fieldKey) {
        fieldConfigOrchestrator.deleteField(bizType, fieldKey);
        return Result.success();
    }
}
