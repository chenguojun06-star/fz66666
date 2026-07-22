package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryCreateDTO;
import com.fashion.supplychain.intelligence.dto.ProceduralMemoryUpdateDTO;
import com.fashion.supplychain.intelligence.entity.ProceduralMemory;
import com.fashion.supplychain.intelligence.service.ProceduralMemoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * L4 程序性记忆 SOP 管理 Controller（P0-3 自编辑工具集升级，2026-07-22）
 *
 * <p>提供 SOP 的 CRUD REST API，支持人工管理和 AI 自编辑。</p>
 * <p>权限：登录用户 + 租户隔离（所有查询带 tenant_id）。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/procedural-memory")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ProceduralMemoryController {

    private final ProceduralMemoryService proceduralMemoryService;

    /** 创建 SOP */
    @PostMapping
    public Result<ProceduralMemory> create(@RequestBody ProceduralMemoryCreateDTO dto) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            ProceduralMemory created = proceduralMemoryService.createSop(tenantId, dto);
            return Result.success(created);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 更新 SOP（selective update） */
    @PutMapping("/{id}")
    public Result<ProceduralMemory> update(@PathVariable("id") Long id,
                                           @RequestBody ProceduralMemoryUpdateDTO dto) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            ProceduralMemory updated = proceduralMemoryService.updateSop(tenantId, id, dto);
            return Result.success(updated);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 软删除 SOP */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            proceduralMemoryService.deleteSop(tenantId, id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 启用 SOP */
    @PostMapping("/{id}/enable")
    public Result<Void> enable(@PathVariable("id") Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            proceduralMemoryService.enableSop(tenantId, id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 禁用 SOP */
    @PostMapping("/{id}/disable")
    public Result<Void> disable(@PathVariable("id") Long id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            proceduralMemoryService.disableSop(tenantId, id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 列表查询 SOP（带 tenant_id 过滤） */
    @GetMapping("/list")
    public Result<List<ProceduralMemory>> list(
            @RequestParam(value = "sopType", required = false) String sopType,
            @RequestParam(value = "enabled", required = false) Boolean enabled,
            @RequestParam(value = "limit", defaultValue = "50") int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
            // Service 内部已强制 .eq(ProceduralMemory::getTenantId, tenantId)
            List<ProceduralMemory> sops = proceduralMemoryService.listSops(tenantId, sopType, enabled, limit);
            return Result.success(sops);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }
}
