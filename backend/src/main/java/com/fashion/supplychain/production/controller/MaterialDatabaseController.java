package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/material/database")
@PreAuthorize("isAuthenticated()")
public class MaterialDatabaseController {

    @Autowired
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;

    @GetMapping("/list")
    public Result<IPage<MaterialDatabase>> list(@RequestParam Map<String, Object> params) {
        return Result.success(materialDatabaseOrchestrator.list(params));
    }

    @GetMapping("/{id}")
    public Result<MaterialDatabase> getById(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialDatabase material) {
        return Result.success(materialDatabaseOrchestrator.save(material));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialDatabase material) {
        return Result.success(materialDatabaseOrchestrator.update(material));
    }

    @PostMapping("/{id}/complete")
    public Result<Boolean> complete(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.complete(id));
    }

    @PostMapping("/{id}/return")
    public Result<Boolean> returnToPending(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body == null ? null : String.valueOf(body.getOrDefault("reason", "")).trim();
        return Result.success(materialDatabaseOrchestrator.returnToPending(id, reason));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.delete(id));
    }
}
