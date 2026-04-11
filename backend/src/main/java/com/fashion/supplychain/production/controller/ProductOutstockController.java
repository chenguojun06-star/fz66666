package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.orchestration.ProductOutstockOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/production/outstock")
@PreAuthorize("isAuthenticated()")
public class ProductOutstockController {

    @Autowired
    private ProductOutstockOrchestrator productOutstockOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        java.util.List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
        }
        if (factoryOrderIds != null) {
            params = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
            params.put("_factoryOrderIds", factoryOrderIds);
        }
        IPage<ProductOutstock> page = productOutstockOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<ProductOutstock> getById(@PathVariable String id) {
        return Result.success(productOutstockOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody ProductOutstock outstock) {
        return Result.success(productOutstockOrchestrator.save(outstock));
    }

    @PostMapping("/{id}/receive")
    public Result<ProductOutstock> receive(@PathVariable String id) {
        return Result.success(productOutstockOrchestrator.receive(id));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(productOutstockOrchestrator.delete(id));
    }
}
