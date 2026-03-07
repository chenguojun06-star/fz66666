package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.TenantReadinessReportResponse;
import com.fashion.supplychain.system.orchestration.TenantReadinessOrchestrator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 租户运营健康控制器（独立编排入口）
 */
@RestController
@RequestMapping("/api/system/tenant-readiness")
@PreAuthorize("isAuthenticated()")
public class TenantReadinessController {

    @Autowired
    private TenantReadinessOrchestrator tenantReadinessOrchestrator;

    @GetMapping("/my")
    public Result<TenantReadinessReportResponse> myReadiness() {
        return Result.success(tenantReadinessOrchestrator.getMyReadiness());
    }

    @GetMapping("/{tenantId}")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<TenantReadinessReportResponse> tenantReadiness(@PathVariable Long tenantId) {
        return Result.success(tenantReadinessOrchestrator.getTenantReadiness(tenantId));
    }

    @GetMapping("/admin/top-risks")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<List<TenantReadinessReportResponse>> topRisks(
            @RequestParam(name = "limit", required = false, defaultValue = "20") Integer limit) {
        return Result.success(tenantReadinessOrchestrator.listTopRisks(limit == null ? 20 : limit));
    }
}
