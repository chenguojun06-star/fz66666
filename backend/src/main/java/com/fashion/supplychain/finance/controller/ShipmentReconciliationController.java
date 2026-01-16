package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.finance.orchestration.ShipmentReconciliationOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/shipment-reconciliation")
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
    public Result<?> updateStatus(@RequestBody Map<String, Object> params) {
        String id = (String) params.get("id");
        String status = (String) params.get("status");
        String message = reconciliationStatusOrchestrator.updateShipmentStatus(id, status);
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@RequestBody Map<String, Object> params) {
        String id = (String) params.get("id");
        String reason = (String) params.get("reason");
        String message = reconciliationStatusOrchestrator.returnShipmentToPrevious(id, reason);
        return Result.successMessage(message);
    }

    @PostMapping("/backfill")
    public Result<?> backfill() {
        return Result.success(shipmentReconciliationOrchestrator.backfill());
    }

}
