package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.warehouse.orchestration.WarehouseOperationOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/warehouse/operation")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class WarehouseOperationController {

    private final WarehouseOperationOrchestrator warehouseOperationOrchestrator;

    @PostMapping("/free-inbound")
    public Result<ProductWarehousing> freeInbound(@RequestBody Map<String, Object> params) {
        ProductWarehousing result = warehouseOperationOrchestrator.freeInbound(params);
        return Result.success(result);
    }

    @PostMapping("/free-outbound")
    public Result<ProductOutstock> freeOutbound(@RequestBody Map<String, Object> params) {
        ProductOutstock result = warehouseOperationOrchestrator.freeOutbound(params);
        return Result.success(result);
    }

    @PostMapping("/scan-inbound")
    public Result<Map<String, Object>> scanInbound(@RequestBody Map<String, Object> params) {
        Map<String, Object> result = warehouseOperationOrchestrator.scanInbound(params);
        return Result.success(result);
    }

    @PostMapping("/scan-outbound")
    public Result<Map<String, Object>> scanOutbound(@RequestBody Map<String, Object> params) {
        Map<String, Object> result = warehouseOperationOrchestrator.scanOutbound(params);
        return Result.success(result);
    }

    @GetMapping("/scan-query")
    public Result<Map<String, Object>> scanQuery(
            @RequestParam String scanCode,
            @RequestParam(required = false, defaultValue = "finished") String warehouseType) {
        Map<String, Object> result = warehouseOperationOrchestrator.scanQuery(scanCode, warehouseType);
        return Result.success(result);
    }
}
