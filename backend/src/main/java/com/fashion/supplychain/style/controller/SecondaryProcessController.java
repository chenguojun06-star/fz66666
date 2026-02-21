package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    private final SecondaryProcessService secondaryProcessService;
    private final StyleQuotationOrchestrator styleQuotationOrchestrator;

    @Operation(summary = "根据款号ID查询二次工艺列表")
    @GetMapping("/list")
    public Result<List<SecondaryProcess>> listByStyleId(@RequestParam Long styleId) {
        List<SecondaryProcess> list = secondaryProcessService.listByStyleId(styleId);
        return Result.success(list);
    }

    @Operation(summary = "根据ID查询二次工艺")
    @GetMapping("/{id}")
    public Result<SecondaryProcess> getById(@PathVariable Long id) {
        SecondaryProcess process = secondaryProcessService.getById(id);
        if (process == null) {
            return Result.fail("二次工艺不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(process.getTenantId(), "二次工艺");
        return Result.success(process);
    }

    @Operation(summary = "新建二次工艺")
    @PostMapping
    public Result<SecondaryProcess> create(@RequestBody SecondaryProcess process) {
        secondaryProcessService.save(process);
        // 二次工艺变更后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(process.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after secondary process create: styleId={}", process.getStyleId(), e);
        }
        return Result.success(process);
    }

    @Operation(summary = "更新二次工艺")
    @PutMapping("/{id}")
    public Result<SecondaryProcess> update(@PathVariable Long id, @RequestBody SecondaryProcess process) {
        process.setId(id);
        secondaryProcessService.updateById(process);
        // 二次工艺变更后自动重算报价单
        Long styleId = process.getStyleId();
        if (styleId == null) {
            SecondaryProcess existing = secondaryProcessService.getById(id);
            styleId = existing != null ? existing.getStyleId() : null;
        }
        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after secondary process update: styleId={}", styleId, e);
            }
        }
        return Result.success(process);
    }

    @Operation(summary = "删除二次工艺")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        // 先获取 styleId 再删除，以便重算报价
        SecondaryProcess existing = secondaryProcessService.getById(id);
        Long styleId = existing != null ? existing.getStyleId() : null;

        secondaryProcessService.removeById(id);

        // 二次工艺删除后自动重算报价单
        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after secondary process delete: styleId={}", styleId, e);
            }
        }
        return Result.success(null);
    }
}
