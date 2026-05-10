package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.orchestration.WarehouseLocationOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/warehouse/location")
@RequiredArgsConstructor
public class WarehouseLocationController {

    private final WarehouseLocationOrchestrator locationOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String locationType,
            @RequestParam(required = false) String warehouseType,
            @RequestParam(required = false) String areaId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return locationOrchestrator.list(page, pageSize, locationType, warehouseType, areaId, status, keyword);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list-by-type")
    public Result<List<WarehouseLocation>> listByType(
            @RequestParam(required = false) String warehouseType,
            @RequestParam(required = false) String areaId) {
        return locationOrchestrator.listByType(warehouseType, areaId);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping
    public Result<WarehouseLocation> create(@RequestBody WarehouseLocation location) {
        return locationOrchestrator.create(location);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/create")
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    public Result<WarehouseLocation> createLegacy(@RequestBody WarehouseLocation location) {
        return locationOrchestrator.create(location);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/{id}")
    public Result<WarehouseLocation> update(@PathVariable String id, @RequestBody WarehouseLocation location) {
        return locationOrchestrator.update(id, location);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/update/{id}")
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    public Result<WarehouseLocation> updateLegacy(@PathVariable String id, @RequestBody WarehouseLocation location) {
        return locationOrchestrator.update(id, location);
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        return locationOrchestrator.delete(id);
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/delete/{id}")
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    public Result<Void> deleteLegacy(@PathVariable String id) {
        return locationOrchestrator.delete(id);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-init")
    public Result<Map<String, Object>> batchInit(@RequestBody Map<String, Object> params) {
        String warehouseType = (String) params.get("warehouseType");
        String areaId = params.get("areaId") != null ? String.valueOf(params.get("areaId")) : null;
        @SuppressWarnings("unchecked")
        List<String> zoneNames = (List<String>) params.get("zoneNames");
        int racksPerZone = params.get("racksPerZone") != null ? Integer.parseInt(String.valueOf(params.get("racksPerZone"))) : 4;
        int levelsPerRack = params.get("levelsPerRack") != null ? Integer.parseInt(String.valueOf(params.get("levelsPerRack"))) : 4;
        int positionsPerLevel = params.get("positionsPerLevel") != null ? Integer.parseInt(String.valueOf(params.get("positionsPerLevel"))) : 2;
        return locationOrchestrator.batchInit(warehouseType, areaId, zoneNames, racksPerZone, levelsPerRack, positionsPerLevel);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/items")
    public Result<Map<String, Object>> queryLocationItems(
            @RequestParam String locationCode,
            @RequestParam(required = false) String warehouseType) {
        return locationOrchestrator.queryLocationItems(locationCode, warehouseType);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/overview")
    public Result<Map<String, Object>> getWarehouseOverview() {
        return locationOrchestrator.getWarehouseOverview();
    }
}
