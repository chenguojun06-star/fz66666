package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.dto.IdReasonRequest;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.finance.orchestration.ShipmentReconciliationOrchestrator;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/shipment-reconciliation")
@PreAuthorize("isAuthenticated()")
public class ShipmentReconciliationController {

    @Autowired
    private ShipmentReconciliationOrchestrator shipmentReconciliationOrchestrator;

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    @Autowired
    private OperationLogService operationLogService;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ShipmentReconciliation> page = shipmentReconciliationOrchestrator.list(params);
        return Result.success(page);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<ShipmentReconciliation> getById(@PathVariable String id) {
        return Result.success(shipmentReconciliationOrchestrator.getById(id));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<Boolean> save(@RequestBody ShipmentReconciliation shipmentReconciliation) {
        return Result.success(shipmentReconciliationOrchestrator.save(shipmentReconciliation));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping
    public Result<Boolean> update(@RequestBody ShipmentReconciliation shipmentReconciliation) {
        return Result.success(shipmentReconciliationOrchestrator.update(shipmentReconciliation));
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(shipmentReconciliationOrchestrator.delete(id));
    }

    /**
     * 统一的状态操作端点（与 MaterialReconciliation 风格一致）
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
                String updateMessage = reconciliationStatusOrchestrator.updateShipmentStatus(id, status);
                return Result.successMessage(updateMessage);

            case "return":
                String returnMessage = reconciliationStatusOrchestrator.returnShipmentToPrevious(id, reason);
                return Result.successMessage(returnMessage);

            default:
                return Result.fail("不支持的操作: " + action);
        }
    }

    /**
     * @deprecated 使用 {@link #statusAction(String, String, String, String)} 替代，action=update
     */
    @Deprecated
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/update-status")
    public Result<?> updateStatus(@Valid @RequestBody UpdateStatusRequest body) {
        String message = reconciliationStatusOrchestrator.updateShipmentStatus(body.getId(), body.getStatus());
        return Result.successMessage(message);
    }

    /**
     * @deprecated 使用 {@link #statusAction(String, String, String, String)} 替代，action=return
     */
    @Deprecated
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        String message = reconciliationStatusOrchestrator.returnShipmentToPrevious(body.getId(), body.getReason());
        return Result.successMessage(message);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(shipmentReconciliationOrchestrator.backfill());
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/deduction-items/{reconciliationId}")
    public Result<List<DeductionItem>> getDeductionItems(@PathVariable String reconciliationId) {
        return Result.success(shipmentReconciliationOrchestrator.getDeductionItems(reconciliationId));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/deduction-items/{reconciliationId}")
    public Result<?> saveDeductionItems(
            @PathVariable String reconciliationId,
            @RequestBody(required = false) List<DeductionItem> items) {
        shipmentReconciliationOrchestrator.saveDeductionItems(reconciliationId,
                items == null ? Collections.emptyList() : items);
        return Result.successMessage("操作成功");
    }

    /**
     * 更新订单备注
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{orderId}/remark")
    public Result<?> updateRemark(@PathVariable String orderId, @RequestBody Map<String, String> request) {
        String remark = request.get("remark");
        ShipmentReconciliation reconciliation = shipmentReconciliationOrchestrator.getById(orderId);
        if (reconciliation == null) {
            return Result.fail("订单结算不存在");
        }
        reconciliation.setRemark(remark);
        shipmentReconciliationOrchestrator.update(reconciliation);
        return Result.success("备注更新成功");
    }

    /**
     * 获取订单操作日志
     * 从 t_operation_log 查询该对账记录相关的操作日志（修改/驳回/结算等）
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{orderId}/logs")
    public Result<List<OperationLog>> getOrderLogs(@PathVariable String orderId) {
        LambdaQueryWrapper<OperationLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OperationLog::getTargetId, orderId)
               .in(OperationLog::getTargetType, "财务单", "出货对账")
               .orderByDesc(OperationLog::getOperationTime)
               .last("LIMIT 50");
        List<OperationLog> logs = operationLogService.list(wrapper);
        return Result.success(logs);
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
