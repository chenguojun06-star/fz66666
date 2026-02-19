package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.dto.IdReasonRequest;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.finance.orchestration.ShipmentReconciliationOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
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

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ShipmentReconciliation> page = shipmentReconciliationOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * @deprecated 已废弃，请使用 GET /list（设置大的pageSize获取全部数据）
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/list-all")
    public Result<List<ShipmentReconciliation>> listAll() {
        return Result.success(shipmentReconciliationOrchestrator.listAll());
    }

    @GetMapping("/{id}")
    public Result<ShipmentReconciliation> getById(@PathVariable String id) {
        return Result.success(shipmentReconciliationOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody ShipmentReconciliation shipmentReconciliation) {
        return Result.success(shipmentReconciliationOrchestrator.save(shipmentReconciliation));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody ShipmentReconciliation shipmentReconciliation) {
        return Result.success(shipmentReconciliationOrchestrator.update(shipmentReconciliation));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(shipmentReconciliationOrchestrator.delete(id));
    }

    @PostMapping("/update-status")
    public Result<?> updateStatus(@Valid @RequestBody UpdateStatusRequest body) {
        String message = reconciliationStatusOrchestrator.updateShipmentStatus(body.getId(), body.getStatus());
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        String message = reconciliationStatusOrchestrator.returnShipmentToPrevious(body.getId(), body.getReason());
        return Result.successMessage(message);
    }

    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(shipmentReconciliationOrchestrator.backfill());
    }

    @GetMapping("/deduction-items/{reconciliationId}")
    public Result<List<DeductionItem>> getDeductionItems(@PathVariable String reconciliationId) {
        return Result.success(shipmentReconciliationOrchestrator.getDeductionItems(reconciliationId));
    }

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
     * 注：当前为轻量级实现，返回空数组
     * 如需详细日志，可考虑：
     * 1. 从 t_shipment_reconciliation 的状态字段获取变更历史
     * 2. 创建独立的 t_operation_log 表记录所有操作
     * 3. 使用AOP切面自动记录关键操作
     */
    @GetMapping("/{orderId}/logs")
    public Result<?> getOrderLogs(@PathVariable String orderId) {
        // 轻量级实现：返回空数组（系统当前不强依赖操作日志）
        return Result.success(Collections.emptyList());
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
