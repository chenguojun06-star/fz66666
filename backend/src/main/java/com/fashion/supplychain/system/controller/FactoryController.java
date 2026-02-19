package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.orchestration.FactoryOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/system/factory")
@PreAuthorize("isAuthenticated()")
public class FactoryController {

    @Autowired
    private FactoryOrchestrator factoryOrchestrator;

    @PreAuthorize("hasAuthority('MENU_SYSTEM_FACTORY_VIEW')")
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String factoryCode,
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String status) {
        IPage<Factory> result = factoryOrchestrator.list(page, pageSize, factoryCode, factoryName, status);
        return Result.success(result);
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_FACTORY_VIEW')")
    @GetMapping("/{id}")
    public Result<Factory> getById(@PathVariable String id) {
        return Result.success(factoryOrchestrator.getById(id));
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_FACTORY_MANAGE')")
    @PostMapping
    public Result<Boolean> save(@RequestBody Factory factory) {
        return Result.success(factoryOrchestrator.save(factory));
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_FACTORY_MANAGE')")
    @PutMapping
    public Result<Boolean> update(@RequestBody Factory factory) {
        return Result.success(factoryOrchestrator.update(factory));
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_FACTORY_MANAGE')")
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id,
            @RequestParam(required = false) String remark) {
        return Result.success(factoryOrchestrator.delete(id, remark));
    }
}
