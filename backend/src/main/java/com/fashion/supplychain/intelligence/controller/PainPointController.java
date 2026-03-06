package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.PainPointAggregationOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PainPointViewOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence/pain-point")
@PreAuthorize("isAuthenticated()")
public class PainPointController {

    @Autowired
    private PainPointAggregationOrchestrator painPointAggregationOrchestrator;

    @Autowired
    private PainPointViewOrchestrator painPointViewOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam(defaultValue = "20") int limit) {
        return Result.success(painPointViewOrchestrator.listCurrentTenantPainPoints(limit));
    }

    @PostMapping("/refresh")
    public Result<?> refresh() {
        return Result.success(painPointAggregationOrchestrator.refreshCurrentTenantPainPoints());
    }
}
