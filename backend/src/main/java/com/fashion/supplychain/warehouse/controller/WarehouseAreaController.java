package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.orchestration.WarehouseAreaOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/warehouse/area")
@RequiredArgsConstructor
public class WarehouseAreaController {

    private final WarehouseAreaOrchestrator areaOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String warehouseType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return areaOrchestrator.list(page, pageSize, warehouseType, status, keyword);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list-by-type")
    public Result<List<WarehouseArea>> listByType(
            @RequestParam(required = false) String warehouseType) {
        return areaOrchestrator.listByType(warehouseType);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<WarehouseArea> create(@RequestBody WarehouseArea area) {
        return areaOrchestrator.create(area);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/{id}")
    public Result<WarehouseArea> update(@PathVariable String id, @RequestBody WarehouseArea area) {
        return areaOrchestrator.update(id, area);
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        return areaOrchestrator.delete(id);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/quick-create")
    public Result<WarehouseArea> quickCreate(@RequestBody Map<String, String> params) {
        String areaName = params.get("areaName");
        String warehouseType = params.get("warehouseType");
        return areaOrchestrator.quickCreate(areaName, warehouseType);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<Map<String, Object>> getAreaDetail(@PathVariable String id) {
        return areaOrchestrator.getAreaDetail(id);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/overview")
    public Result<Map<String, Object>> getAreaOverview() {
        return areaOrchestrator.getAreaOverview();
    }
}
