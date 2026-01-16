package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/production/warehousing")
public class ProductWarehousingController {

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ProductWarehousing> page = productWarehousingOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<ProductWarehousing> getById(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.save(productWarehousing));
    }

    @PostMapping("/batch")
    public Result<?> batchSave(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.batchSave(body));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.update(productWarehousing));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.delete(id));
    }

    @PostMapping("/rollback-by-bundle")
    public Result<?> rollbackByBundle(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.rollbackByBundle(body));
    }
}
