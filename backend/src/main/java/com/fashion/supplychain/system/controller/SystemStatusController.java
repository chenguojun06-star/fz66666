package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.orchestration.SystemStatusOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 系统运行状态 Controller（简易运维面板）
 * 超管在客户管理页面查看系统运行状态
 *
 * <p>D-636：JVM 指标采集、租户人员聚合、库结构体检已下沉到
 * {@link SystemStatusOrchestrator}。本类只保留端点声明与响应组装，
 * 不再直接注入任何 Service。
 */
@RestController
@RequestMapping("/api/system/status")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class SystemStatusController {

    @Autowired
    private SystemStatusOrchestrator systemStatusOrchestrator;

    /**
     * 系统运行状态概览
     */
    @GetMapping("/overview")
    public Result<?> overview() {
        return Result.success(systemStatusOrchestrator.overview());
    }

    /**
     * 租户人员统计（每个租户的用户数量、上限、活跃/待审批分类）
     */
    @GetMapping("/tenant-user-stats")
    public Result<?> tenantUserStats() {
        return Result.success(systemStatusOrchestrator.tenantUserStats());
    }

    /**
     * 数据库结构健康检查。
     * 用于发布前/发布后核对关键表结构与当前代码是否一致。
     */
    @GetMapping("/structure-health")
    public Result<?> structureHealth() {
        return Result.success(systemStatusOrchestrator.structureHealth());
    }
}
