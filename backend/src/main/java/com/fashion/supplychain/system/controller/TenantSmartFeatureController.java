package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.TenantSmartFeatureSaveRequest;
import com.fashion.supplychain.system.orchestration.TenantSmartFeatureOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/tenant-smart-feature")
@PreAuthorize("isAuthenticated()")
public class TenantSmartFeatureController {

    @Autowired
    private TenantSmartFeatureOrchestrator tenantSmartFeatureOrchestrator;

    @GetMapping("/list")
    public Result<Map<String, Boolean>> list() {
        return Result.success(tenantSmartFeatureOrchestrator.listCurrentTenantFeatures());
    }

    /** 查询所有智能开关（前端显示类 + 后端动作类，合并返回） */
    @GetMapping("/all")
    public Result<Map<String, Boolean>> listAll() {
        return Result.success(tenantSmartFeatureOrchestrator.listAllSmartFeatures());
    }

    @PutMapping
    public Result<Map<String, Boolean>> update(@RequestBody(required = false) TenantSmartFeatureSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveCurrentTenantFeatures(
                request == null ? null : request.getFeatures()
        ));
    }

    /** 保存后端动作类开关（backend.action.*，默认全部关闭，需用户手动开启） */
    @PutMapping("/backend-actions")
    public Result<Map<String, Boolean>> updateBackendActions(@RequestBody Map<String, Boolean> actionFlags) {
        return Result.success(tenantSmartFeatureOrchestrator.saveBackendActionFlags(actionFlags));
    }

    /** @deprecated 使用 PUT / 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @PostMapping("/save")
    public Result<Map<String, Boolean>> save(@RequestBody(required = false) TenantSmartFeatureSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveCurrentTenantFeatures(
                request == null ? null : request.getFeatures()
        ));
    }
}
