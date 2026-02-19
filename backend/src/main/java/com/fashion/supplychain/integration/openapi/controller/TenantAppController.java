package com.fashion.supplychain.integration.openapi.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.openapi.dto.TenantAppRequest;
import com.fashion.supplychain.integration.openapi.dto.TenantAppResponse;
import com.fashion.supplychain.integration.openapi.entity.TenantAppLog;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * 客户应用管理 Controller（后台管理端接口）
 *
 * 管理应用的创建、配置、状态切换、密钥重置、调用日志查看等
 */
@RestController
@RequestMapping("/api/system/tenant-app")
@PreAuthorize("isAuthenticated()")
public class TenantAppController {

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    /**
     * 创建应用
     * 返回含明文 appKey + appSecret（仅此一次）
     */
    @PostMapping("/create")
    public Result<TenantAppResponse> create(@RequestBody TenantAppRequest request) {
        Long tenantId = UserContext.tenantId();
        TenantAppResponse response = tenantAppOrchestrator.createApp(tenantId, request);
        return Result.success(response);
    }

    /**
     * 查询应用列表
     */
    @PostMapping("/list")
    public Result<Page<TenantAppResponse>> list(@RequestBody Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        String appType = (String) params.get("appType");
        String status = (String) params.get("status");
        int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
        int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;

        Page<TenantAppResponse> result = tenantAppOrchestrator.listApps(tenantId, appType, status, page, size);
        return Result.success(result);
    }

    /**
     * 获取应用详情
     */
    @GetMapping("/{id}")
    public Result<TenantAppResponse> detail(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        TenantAppResponse response = tenantAppOrchestrator.getAppDetail(id, tenantId);
        return Result.success(response);
    }

    /**
     * 更新应用配置
     */
    @PutMapping("/{id}")
    public Result<TenantAppResponse> update(@PathVariable String id, @RequestBody TenantAppRequest request) {
        Long tenantId = UserContext.tenantId();
        TenantAppResponse response = tenantAppOrchestrator.updateApp(id, tenantId, request);
        return Result.success(response);
    }

    /**
     * 切换应用状态（启用/停用）
     */
    @PostMapping("/{id}/toggle-status")
    public Result<TenantAppResponse> toggleStatus(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        TenantAppResponse response = tenantAppOrchestrator.toggleStatus(id, tenantId);
        return Result.success(response);
    }

    /**
     * 重置密钥（返回新的明文密钥，仅此一次）
     */
    @PostMapping("/{id}/reset-secret")
    public Result<TenantAppResponse> resetSecret(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        TenantAppResponse response = tenantAppOrchestrator.resetSecret(id, tenantId);
        return Result.success(response);
    }

    /**
     * 删除应用
     */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        tenantAppOrchestrator.deleteApp(id, tenantId);
        return Result.success();
    }

    /**
     * 获取可用应用类型列表
     */
    @GetMapping("/app-types")
    public Result<List<Map<String, String>>> getAppTypes() {
        return Result.success(tenantAppOrchestrator.getAppTypes());
    }

    /**
     * 获取应用统计
     */
    @GetMapping("/stats")
    public Result<Map<String, Object>> getStats() {
        Long tenantId = UserContext.tenantId();
        return Result.success(tenantAppOrchestrator.getStats(tenantId));
    }

    /**
     * 查询调用日志
     */
    @PostMapping("/{id}/logs")
    public Result<Page<TenantAppLog>> logs(@PathVariable String id, @RequestBody Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
        int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;

        Page<TenantAppLog> result = tenantAppOrchestrator.listLogs(id, tenantId, page, size);
        return Result.success(result);
    }

    /**
     * 查询所有调用日志（不限定某个应用，用于集成中心页面）
     */
    @PostMapping("/all-logs")
    public Result<Page<TenantAppLog>> allLogs(@RequestBody Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
        int size = params.get("size") != null ? ((Number) params.get("size")).intValue() : 20;

        Page<TenantAppLog> result = tenantAppOrchestrator.listLogs(null, tenantId, page, size);
        return Result.success(result);
    }

    /**
     * 集成总览 — 返回 4 大模块的对接状态、最近活动、数据统计
     * 前端集成中心页面用此接口获取全局概览
     */
    @GetMapping("/integration-overview")
    public Result<Map<String, Object>> getIntegrationOverview() {
        Long tenantId = UserContext.tenantId();
        return Result.success(tenantAppOrchestrator.getIntegrationOverview(tenantId));
    }
}
