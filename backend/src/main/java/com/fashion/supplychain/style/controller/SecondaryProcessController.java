package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

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
        normalizeProcess(process, null);
        secondaryProcessService.save(process);
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
        SecondaryProcess existing = secondaryProcessService.getById(id);
        process.setId(id);
        normalizeProcess(process, existing);
        secondaryProcessService.updateById(process);
        Long styleId = process.getStyleId();
        if (styleId == null) {
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

    private void normalizeProcess(SecondaryProcess process, SecondaryProcess existing) {
        if (process == null) {
            return;
        }
        if (!StringUtils.hasText(process.getProcessType())) {
            String existingType = (existing != null && StringUtils.hasText(existing.getProcessType()))
                    ? existing.getProcessType() : null;
            process.setProcessType(existingType != null ? existingType : "二次工艺");
        }
        String normalizedStatus = normalizeStatus(process.getStatus());
        process.setStatus(normalizedStatus);

        String currentUser = StringUtils.hasText(UserContext.username()) ? UserContext.username().trim() : null;
        String assignee = firstNonBlank(process.getAssignee(), existing != null ? existing.getAssignee() : null, currentUser);
        if (StringUtils.hasText(assignee)) {
            process.setAssignee(assignee);
        }

        if ("completed".equals(normalizedStatus)) {
            LocalDateTime completedTime = process.getCompletedTime();
            if (completedTime == null && existing != null) {
                completedTime = existing.getCompletedTime();
            }
            process.setCompletedTime(completedTime != null ? completedTime : LocalDateTime.now());
            return;
        }

        process.setCompletedTime(null);
    }

    private String normalizeStatus(String rawStatus) {
        String status = StringUtils.hasText(rawStatus) ? rawStatus.trim().toLowerCase() : "pending";
        return Set.of("pending", "processing", "completed", "cancelled").contains(status) ? status : "pending";
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }
}
