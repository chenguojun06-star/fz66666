package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/finance/material-reconciliation")
public class MaterialReconciliationController {

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<MaterialReconciliation> page = materialReconciliationOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<MaterialReconciliation> getById(@PathVariable String id) {
        return Result.success(materialReconciliationOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialReconciliation materialReconciliation) {
        return Result.success(materialReconciliationOrchestrator.save(materialReconciliation));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialReconciliation materialReconciliation) {
        return Result.success(materialReconciliationOrchestrator.update(materialReconciliation));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialReconciliationOrchestrator.delete(id));
    }

    @PostMapping("/update-status")
    public Result<?> updateStatus(@RequestBody Map<String, Object> params) {
        String id = params == null ? null : (String) params.get("id");
        String status = params == null ? null : (String) params.get("status");
        String message = reconciliationStatusOrchestrator.updateMaterialStatus(id, status);
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@RequestBody Map<String, Object> params) {
        String id = params == null ? null : (String) params.get("id");
        String reason = params == null ? null : (String) params.get("reason");
        String message = reconciliationStatusOrchestrator.returnMaterialToPrevious(id, reason);
        return Result.successMessage(message);
    }

    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(materialReconciliationOrchestrator.backfill());
    }
}
