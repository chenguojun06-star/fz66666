package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.InventoryCheck;
import com.fashion.supplychain.warehouse.orchestration.InventoryCheckOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/warehouse/inventory-check")
@PreAuthorize("isAuthenticated()")
public class InventoryCheckController {

    @Autowired
    private InventoryCheckOrchestrator orchestrator;

    @PostMapping("/create")
    @PreAuthorize("isAuthenticated()")
    public Result<InventoryCheck> createCheck(@RequestBody Map<String, Object> params) {
        return Result.success(orchestrator.createCheck(params));
    }

    @PostMapping("/fill-actual")
    @PreAuthorize("isAuthenticated()")
    public Result<InventoryCheck> fillActual(@RequestBody Map<String, Object> params) {
        String checkId = (String) params.get("checkId");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> actualData = (List<Map<String, Object>>) params.get("items");
        return Result.success(orchestrator.fillActualQuantities(checkId, actualData));
    }

    @PostMapping("/confirm/{checkId}")
    @PreAuthorize("isAuthenticated()")
    public Result<InventoryCheck> confirm(@PathVariable("checkId") String checkId) {
        return Result.success(orchestrator.confirmCheck(checkId));
    }

    @PostMapping("/cancel/{checkId}")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> cancel(@PathVariable("checkId") String checkId) {
        orchestrator.cancelCheck(checkId);
        return Result.success(null);
    }

    @PostMapping("/list")
    public Result<IPage<InventoryCheck>> list(@RequestBody Map<String, Object> params) {
        return Result.success(orchestrator.listChecks(params));
    }

    @GetMapping("/detail/{checkId}")
    public Result<InventoryCheck> detail(@PathVariable("checkId") String checkId) {
        return Result.success(orchestrator.getDetail(checkId));
    }

    @GetMapping("/summary")
    public Result<Map<String, Object>> summary() {
        return Result.success(orchestrator.getInventorySummary());
    }
}
