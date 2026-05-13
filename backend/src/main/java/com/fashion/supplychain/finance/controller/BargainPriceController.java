package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.BargainPrice;
import com.fashion.supplychain.finance.orchestration.BargainPriceOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bargain-price")
@PreAuthorize("isAuthenticated()")
public class BargainPriceController {

    @Autowired
    private BargainPriceOrchestrator bargainPriceOrchestrator;

    @PostMapping
    public Result<BargainPrice> submit(@RequestBody BargainPrice bargainPrice) {
        return Result.success(bargainPriceOrchestrator.submit(bargainPrice));
    }

    @PostMapping("/{id}/stage-action")
    public Result<BargainPrice> stageAction(@PathVariable Long id, @RequestParam String action) {
        switch (action) {
            case "approve":
                return Result.success(bargainPriceOrchestrator.approve(id));
            case "reject":
                return Result.success(bargainPriceOrchestrator.reject(id));
            default:
                return Result.fail("不支持的操作: " + action);
        }
    }

    @PutMapping("/{id}/approve")
    @Deprecated
    public Result<BargainPrice> approve(@PathVariable Long id) {
        return Result.success(bargainPriceOrchestrator.approve(id));
    }

    @PutMapping("/{id}/reject")
    @Deprecated
    public Result<BargainPrice> reject(@PathVariable Long id) {
        return Result.success(bargainPriceOrchestrator.reject(id));
    }

    @PostMapping("/list")
    public Result<List<BargainPrice>> listByTarget(@RequestBody java.util.Map<String, String> params) {
        return Result.success(bargainPriceOrchestrator.listByTarget(
                params.get("targetType"), params.get("targetId")));
    }

    @GetMapping("/{targetType}/{targetId}/latest")
    public Result<BargainPrice> getLatestApproved(@PathVariable String targetType,
                                                   @PathVariable String targetId) {
        return Result.success(bargainPriceOrchestrator.getLatestApproved(targetType, targetId));
    }
}
