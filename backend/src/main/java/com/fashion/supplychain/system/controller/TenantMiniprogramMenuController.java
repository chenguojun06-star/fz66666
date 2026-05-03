package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.MiniprogramMenuSaveRequest;
import com.fashion.supplychain.system.orchestration.TenantSmartFeatureOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/tenant-miniprogram-menu")
@PreAuthorize("isAuthenticated()")
public class TenantMiniprogramMenuController {

    @Autowired
    private TenantSmartFeatureOrchestrator tenantSmartFeatureOrchestrator;

    @GetMapping("/my-menus")
    public Result<Map<String, Boolean>> myMenus() {
        return Result.success(tenantSmartFeatureOrchestrator.listMiniprogramMenuFlags());
    }

    @PutMapping
    public Result<Map<String, Boolean>> update(@RequestBody(required = false) MiniprogramMenuSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveMiniprogramMenuFlags(
                request == null ? null : request.getMenus()
        ));
    }
}
