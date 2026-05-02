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

    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String factoryCode,
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String supplierType,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String parentOrgUnitId) {
        // 工厂账号只能查看自己的工厂信息
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            if (ctxFactoryId == null) {
                return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
            }
            Factory self = factoryOrchestrator.getById(ctxFactoryId);
            if (self == null) {
                return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
            }
            com.baomidou.mybatisplus.extension.plugins.pagination.Page<Factory> singlePage = new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            singlePage.setRecords(java.util.Collections.singletonList(self));
            singlePage.setTotal(1);
            return Result.success(singlePage);
        }
        IPage<Factory> result = factoryOrchestrator.list(page, pageSize, factoryCode, factoryName, status, supplierType, factoryType, parentOrgUnitId);
        return Result.success(result);
    }

    @GetMapping("/{id}")
    public Result<Factory> getById(@PathVariable String id) {
        // 工厂账号只能查看自己的工厂信息
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            if (ctxFactoryId == null || !ctxFactoryId.equals(id)) {
                return Result.success(null);
            }
        }
        return Result.success(factoryOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody Factory factory) {
        // 工厂账号不可创建工厂
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.fail("工厂账号无权创建工厂");
        }
        return Result.success(factoryOrchestrator.save(factory));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody Factory factory) {
        // 工厂账号只能更新自己的工厂信息
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            if (ctxFactoryId == null || !ctxFactoryId.equals(factory.getId())) {
                return Result.fail("工厂账号只能更新自己的工厂信息");
            }
        }
        return Result.success(factoryOrchestrator.update(factory));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id,
            @RequestParam(required = false) String remark) {
        // 工厂账号不可删除工厂
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.fail("工厂账号无权删除工厂");
        }
        return Result.success(factoryOrchestrator.delete(id, remark));
    }

    @PutMapping("/{id}/admission")
    public Result<Boolean> approveAdmission(@PathVariable String id,
            @RequestParam String action,
            @RequestParam(required = false) String reason) {
        // 工厂账号不可审核准入
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.fail("工厂账号无权审核工厂准入");
        }
        return Result.success(factoryOrchestrator.approveAdmission(id, action, reason));
    }

    @PutMapping("/{id}/contract")
    public Result<Boolean> updateContract(@PathVariable String id,
            @RequestBody Factory contractFields) {
        // 工厂账号只能更新自己的合同信息
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            if (ctxFactoryId == null || !ctxFactoryId.equals(id)) {
                return Result.fail("工厂账号只能更新自己的合同信息");
            }
        }
        return Result.success(factoryOrchestrator.updateContract(id, contractFields));
    }
}
