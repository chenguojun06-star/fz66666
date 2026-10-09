package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/finance/material-reconciliation")
@PreAuthorize("isAuthenticated()")
public class MaterialReconciliationController {

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<MaterialReconciliation> page = materialReconciliationOrchestrator.list(params);
        return Result.success(page);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<MaterialReconciliation> getById(@PathVariable String id) {
        return Result.success(materialReconciliationOrchestrator.getById(id));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialReconciliation materialReconciliation) {
        return Result.success(materialReconciliationOrchestrator.save(materialReconciliation));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialReconciliation materialReconciliation) {
        return Result.success(materialReconciliationOrchestrator.update(materialReconciliation));
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialReconciliationOrchestrator.delete(id));
    }

    /**
     * 统一的状态操作端点（替代2个分散端点）
     *
     * @param id 对账记录ID
     * @param action 操作类型：update/return
     * @param status 目标状态（用于update操作）
     * @param reason 退回原因（用于return操作）
     * @return 操作结果
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/status-action")
    public Result<?> statusAction(
            @PathVariable String id,
            @RequestParam String action,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String reason) {

        // 智能路由到对应的Orchestrator方法
        switch (action.toLowerCase()) {
            case "update":
                if (status == null || status.trim().isEmpty()) {
                    return Result.fail("status不能为空");
                }
                String updateMessage = reconciliationStatusOrchestrator.updateMaterialStatus(id, status);
                return Result.successMessage(updateMessage);

            case "return":
                String returnMessage = reconciliationStatusOrchestrator.returnMaterialToPrevious(id, reason);
                return Result.successMessage(returnMessage);

            default:
                return Result.fail("不支持的操作: " + action);
        }
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(materialReconciliationOrchestrator.backfill());
    }

    /**
     * D-513：按「实际到货数量」重算待核实对账。
     *
     * <p>修历史数据用：回料确认未回写到货量期间生成的对账，数量/金额取的是预采购数。
     * 只重算 status=pending（待核实）的记录，返回逐条变更明细（旧值→新值）。
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/recompute-from-actual-arrival")
    public Result<?> recomputeFromActualArrival() {
        return Result.success(materialReconciliationOrchestrator.recomputePendingFromActualArrival());
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
