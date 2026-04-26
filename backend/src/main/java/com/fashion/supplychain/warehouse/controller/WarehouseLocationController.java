package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.orchestration.WarehouseLocationOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return locationOrchestrator.list(page, pageSize, locationType, warehouseType, status, keyword);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list-by-type")
    public Result<List<WarehouseLocation>> listByType(
            @RequestParam(required = false) String warehouseType) {
        return locationOrchestrator.listByType(warehouseType);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/create")
    public Result<WarehouseLocation> create(@RequestBody WarehouseLocation location) {
        return locationOrchestrator.create(location);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/update/{id}")
    public Result<WarehouseLocation> update(@PathVariable String id, @RequestBody WarehouseLocation location) {
        return locationOrchestrator.update(id, location);
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable String id) {
        return locationOrchestrator.delete(id);
    }
}
