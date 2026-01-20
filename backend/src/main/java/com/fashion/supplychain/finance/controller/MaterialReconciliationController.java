package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.dto.IdReasonRequest;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
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
    public Result<?> updateStatus(@Valid @RequestBody UpdateStatusRequest body) {
        String message = reconciliationStatusOrchestrator.updateMaterialStatus(body.getId(), body.getStatus());
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        String message = reconciliationStatusOrchestrator.returnMaterialToPrevious(body.getId(), body.getReason());
        return Result.successMessage(message);
    }

    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(materialReconciliationOrchestrator.backfill());
    }

    public static class UpdateStatusRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotBlank(message = "status不能为空")
        private String status;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }
    }
}
