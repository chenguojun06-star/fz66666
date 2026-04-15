package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleProcessOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/style/process")
@PreAuthorize("isAuthenticated()")
public class StyleProcessController {

    @Autowired
    private StyleProcessOrchestrator styleProcessOrchestrator;

    @Autowired
    private StyleInfoService styleInfoService;

    @GetMapping("/list")
    public Result<List<StyleProcess>> listByStyleId(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = null;
        if (StringUtils.hasText(styleId)) {
            try {
                resolvedStyleId = Long.parseLong(styleId.trim());
            } catch (NumberFormatException e) {
                styleNo = styleId.trim();
            }
        }
        if (resolvedStyleId == null && StringUtils.hasText(styleNo)) {
            Long currentTenantId = UserContext.tenantId();
            StyleInfo style = styleInfoService.lambdaQuery()
                    .eq(StyleInfo::getStyleNo, styleNo.trim())
                    .eq(currentTenantId != null, StyleInfo::getTenantId, currentTenantId)
                    .orderByDesc(StyleInfo::getId)
                    .last("limit 1")
                    .one();
            if (style == null || style.getId() == null) {
                return Result.success(Collections.emptyList());
            }
            resolvedStyleId = style.getId();
        }
        if (resolvedStyleId == null) {
            return Result.fail("缺少参数 styleId 或 styleNo");
        }
        return Result.success(styleProcessOrchestrator.listByStyleId(resolvedStyleId));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody StyleProcess styleProcess) {
        return Result.success(styleProcessOrchestrator.save(styleProcess));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody StyleProcess styleProcess) {
        return Result.success(styleProcessOrchestrator.update(styleProcess));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleProcessOrchestrator.delete(id));
    }
}
