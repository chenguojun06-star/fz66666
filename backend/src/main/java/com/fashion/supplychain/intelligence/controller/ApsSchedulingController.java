package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingRequest;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse;
import com.fashion.supplychain.intelligence.entity.FactoryCalendar;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import com.fashion.supplychain.intelligence.orchestration.ApsCapacityOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ApsSchedulingOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * APS 高级排产约束求解 Controller
 *
 * <p>权限：登录用户 + 租户隔离（所有查询带 tenant_id）</p>
 *
 * <p>本类只做「租户上下文断言 + 参数校验 + 调 Orchestrator + 组装响应」。
 * 排产求解在 {@link ApsSchedulingOrchestrator}，产能/日历配置在 {@link ApsCapacityOrchestrator}
 * —— 原先直接注入的两个 Service 已下沉（D-630 规则6）。
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/aps")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ApsSchedulingController {

    private final ApsSchedulingOrchestrator apsSchedulingOrchestrator;
    private final ApsCapacityOrchestrator apsCapacityOrchestrator;

    /** 执行排产求解 */
    @PostMapping("/schedule")
    public Result<ApsSchedulingResponse> schedule(@RequestBody(required = false) ApsSchedulingRequest request) {
        TenantAssert.assertTenantContext();
        try {
            ApsSchedulingResponse response = apsSchedulingOrchestrator.solveScheduling(request);
            return Result.success(response);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 查询工序产能配置 */
    @GetMapping("/process-capacity")
    public Result<List<ProcessCapacity>> listProcessCapacity(
            @RequestParam(value = "factoryName", required = false) String factoryName) {
        TenantAssert.assertTenantContext();
        return apsCapacityOrchestrator.listProcessCapacity(factoryName);
    }

    /** 保存工序产能配置（新增或更新） */
    @PostMapping("/process-capacity")
    public Result<ProcessCapacity> saveProcessCapacity(@RequestBody ProcessCapacity capacity) {
        TenantAssert.assertTenantContext();
        return apsCapacityOrchestrator.saveProcessCapacity(capacity);
    }

    /** 查询工厂工作日历 */
    @GetMapping("/factory-calendar")
    public Result<List<FactoryCalendar>> listFactoryCalendar(
            @RequestParam(value = "factoryId", required = false) String factoryId,
            @RequestParam(value = "startDate", required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam(value = "endDate", required = false)
            @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate) {
        TenantAssert.assertTenantContext();
        return apsCapacityOrchestrator.listFactoryCalendar(factoryId, startDate, endDate);
    }

    /** 保存工厂工作日历记录（新增或更新） */
    @PostMapping("/factory-calendar")
    public Result<FactoryCalendar> saveFactoryCalendar(@RequestBody FactoryCalendar calendar) {
        TenantAssert.assertTenantContext();
        return apsCapacityOrchestrator.saveFactoryCalendar(calendar);
    }
}
