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

    @GetMapping("/menu-roles")
    public Result<Map<String, Map<String, Boolean>>> menuRoles() {
        return Result.success(tenantSmartFeatureOrchestrator.listMiniprogramMenuFlagsByRole());
    }

    @GetMapping("/menu-meta")
    public Result<Map<String, Object>> menuMeta() {
        return Result.success(Map.of(
                "roles", TenantSmartFeatureOrchestrator.MENU_ROLE_LABELS,
                "menus", TenantSmartFeatureOrchestrator.MENU_KEY_LABELS
        ));
    }

    @PutMapping("/menu-roles")
    public Result<Map<String, Map<String, Boolean>>> updateByRole(
            @RequestBody(required = false) MiniprogramMenuSaveRequest request) {
        Map<String, Map<String, Boolean>> roleMenus = (request != null) ? request.getRoleMenus() : null;
        return Result.success(tenantSmartFeatureOrchestrator.saveMiniprogramMenuFlagsByRole(roleMenus));
    }

    @PutMapping
    public Result<Map<String, Boolean>> update(@RequestBody(required = false) MiniprogramMenuSaveRequest request) {
        return Result.success(tenantSmartFeatureOrchestrator.saveMiniprogramMenuFlags(
                request == null ? null : request.getMenus()
        ));
    }
}
