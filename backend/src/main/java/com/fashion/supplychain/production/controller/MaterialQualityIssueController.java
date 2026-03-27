package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.orchestration.MaterialQualityIssueOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/production/material-quality-issues")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class MaterialQualityIssueController {

    private final MaterialQualityIssueOrchestrator materialQualityIssueOrchestrator;

    @GetMapping
    public Result<List<MaterialQualityIssue>> list(@RequestParam String purchaseId) {
        return Result.success(materialQualityIssueOrchestrator.listByPurchaseId(purchaseId));
    }

    @PostMapping
    public Result<MaterialQualityIssue> create(@RequestBody Map<String, Object> body) {
        return Result.success(materialQualityIssueOrchestrator.create(body));
    }

    @PostMapping("/{id}/resolve")
    public Result<MaterialQualityIssue> resolve(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return Result.success(materialQualityIssueOrchestrator.resolve(id, body));
    }
}
