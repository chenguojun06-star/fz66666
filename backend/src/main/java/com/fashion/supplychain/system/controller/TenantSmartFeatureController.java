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

    @PutMapping
    public Result<Map<String, Boolean>> update(@RequestBody(required = false) TenantSmartFeatureSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveCurrentTenantFeatures(
                request == null ? null : request.getFeatures()
        ));
    }

    /** @deprecated 使用 PUT / 替代 */
    @Deprecated
    @PostMapping("/save")
    public Result<Map<String, Boolean>> save(@RequestBody(required = false) TenantSmartFeatureSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveCurrentTenantFeatures(
                request == null ? null : request.getFeatures()
        ));
    }
}
