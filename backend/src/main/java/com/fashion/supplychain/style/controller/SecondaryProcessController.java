package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.orchestration.SecondaryProcessOrchestrator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 二次工艺Controller
 */
@Tag(name = "二次工艺管理")
@Slf4j
@RestController
@RequestMapping("/api/style/secondary-process")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class SecondaryProcessController {

    private final SecondaryProcessOrchestrator secondaryProcessOrchestrator;

    @Operation(summary = "根据款号ID查询二次工艺列表")
    @GetMapping("/list")
    public Result<List<SecondaryProcess>> listByStyleId(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.success(java.util.Collections.emptyList());
        }
        List<SecondaryProcess> list = secondaryProcessOrchestrator.listByStyleId(resolvedStyleId);
        return Result.success(list);
    }

    @Operation(summary = "根据ID查询二次工艺")
    @GetMapping("/{id}")
    public Result<SecondaryProcess> getById(@PathVariable Long id) {
        SecondaryProcess process = secondaryProcessOrchestrator.getById(id);
        if (process == null) {
            return Result.fail("二次工艺不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(process.getTenantId(), "二次工艺");
        return Result.success(process);
    }

    @Operation(summary = "新建二次工艺")
    @PostMapping
    public Result<SecondaryProcess> create(@RequestBody SecondaryProcess process) {
        try {
            SecondaryProcess saved = secondaryProcessOrchestrator.createProcess(process);
            return Result.success(saved);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    @Operation(summary = "更新二次工艺")
    @PutMapping("/{id}")
    public Result<SecondaryProcess> update(@PathVariable Long id, @RequestBody SecondaryProcess process) {
        SecondaryProcess existing = secondaryProcessOrchestrator.getById(id);
        if (existing != null) {
            TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "二次工艺");
        }
        try {
            SecondaryProcess updated = secondaryProcessOrchestrator.updateProcess(id, process);
            return Result.success(updated);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    @Operation(summary = "删除二次工艺")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        SecondaryProcess existing = secondaryProcessOrchestrator.getById(id);
        if (existing != null) {
            TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "二次工艺");
        }
        try {
            secondaryProcessOrchestrator.deleteProcess(id);
            return Result.success(null);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    @Operation(summary = "审批二次工艺（主管权限）")
    @PostMapping("/{id}/approve")
    public Result<SecondaryProcess> approve(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管以上可审批二次工艺");
        }
        SecondaryProcess existing = secondaryProcessOrchestrator.getById(id);
        if (existing == null) {
            return Result.fail("二次工艺不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "二次工艺");
        try {
            SecondaryProcess approved = secondaryProcessOrchestrator.approveProcess(id, body);
            return Result.success(approved);
        } catch (IllegalStateException | NoSuchElementException e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }
}
