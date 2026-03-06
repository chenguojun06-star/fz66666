package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.TenantIntelligenceProfileViewOrchestrator;
import com.fashion.supplychain.system.dto.TenantIntelligenceProfileResponse;
import com.fashion.supplychain.system.dto.TenantIntelligenceProfileSaveRequest;
import com.fashion.supplychain.system.orchestration.TenantIntelligenceProfileOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/tenant-intelligence-profile")
@PreAuthorize("isAuthenticated()")
public class TenantIntelligenceProfileController {

    @Autowired
    private TenantIntelligenceProfileOrchestrator tenantIntelligenceProfileOrchestrator;

    @Autowired
    private TenantIntelligenceProfileViewOrchestrator tenantIntelligenceProfileViewOrchestrator;

    @GetMapping("/current")
    public Result<TenantIntelligenceProfileResponse> current() {
        return Result.success(tenantIntelligenceProfileViewOrchestrator.getCurrentTenantProfileView());
    }

    @PostMapping("/save")
    public Result<TenantIntelligenceProfileResponse> save(@RequestBody(required = false) TenantIntelligenceProfileSaveRequest request) {
        tenantIntelligenceProfileOrchestrator.saveCurrentTenantProfile(request);
        return Result.success(tenantIntelligenceProfileViewOrchestrator.getCurrentTenantProfileView());
    }

    @PostMapping("/reset")
    public Result<TenantIntelligenceProfileResponse> reset() {
        tenantIntelligenceProfileOrchestrator.resetCurrentTenantProfile();
        return Result.success(tenantIntelligenceProfileViewOrchestrator.getCurrentTenantProfileView());
    }
}