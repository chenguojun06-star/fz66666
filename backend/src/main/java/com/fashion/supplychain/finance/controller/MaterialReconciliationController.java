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

    /**
     * 统一的状态操作端点（替代2个分散端点）
     *
     * @param id 对账记录ID
     * @param action 操作类型：update/return
     * @param status 目标状态（用于update操作）
     * @param reason 退回原因（用于return操作）
     * @return 操作结果
     */
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

    /**
     * @deprecated 请使用 POST /{id}/status-action?action=update&status=xxx
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/update-status")
    public Result<?> updateStatus(@Valid @RequestBody UpdateStatusRequest body) {
        return statusAction(body.getId(), "update", body.getStatus(), null);
    }

    /**
     * @deprecated 请使用 POST /{id}/status-action?action=return&reason=xxx
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        return statusAction(body.getId(), "return", null, body.getReason());
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
