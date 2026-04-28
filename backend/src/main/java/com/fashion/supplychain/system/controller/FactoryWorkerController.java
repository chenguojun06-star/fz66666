package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.FactoryWorker;
import com.fashion.supplychain.system.service.FactoryWorkerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 外发工厂工人管理（工厂账号管理其工人名册，扫码时从名册选人）
 */
@RestController
@RequestMapping("/api/factory-worker")
@PreAuthorize("isAuthenticated()")
public class FactoryWorkerController {

    @Autowired
    private FactoryWorkerService factoryWorkerService;

    /**
     * 查询工人列表
     * - 外发工厂账号：只能看自已工厂的工人（factoryId 取自 UserContext）
     * - 租户管理员：可传 factoryId 参数查询指定工厂，否则返回本租户所有工人
     */
    @GetMapping("/list")
    public Result<List<FactoryWorker>> list(
            @RequestParam(required = false) String factoryId,
            @RequestParam(required = false) String status) {
        QueryWrapper<FactoryWorker> wrapper = new QueryWrapper<>();
        wrapper.eq("delete_flag", 0);
        wrapper.eq("tenant_id", UserContext.tenantId());

        // 外发工厂账号只能查自己工厂的工人
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            wrapper.eq("factory_id", ctxFactoryId);
        } else if (StringUtils.hasText(factoryId)) {
            wrapper.eq("factory_id", factoryId);
        }

        if (StringUtils.hasText(status)) {
            wrapper.eq("status", status);
        }
        wrapper.orderByAsc("worker_no", "worker_name");

        return Result.success(factoryWorkerService.list(wrapper));
    }

    /**
     * 保存（新增或更新）工人
     * 新增时自动绑定当前用户的 tenantId 和 factoryId
     */
    @PostMapping("/save")
    public Result<Boolean> save(@RequestBody FactoryWorker worker) {
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            worker.setFactoryId(ctxFactoryId);
        } else if (!StringUtils.hasText(worker.getFactoryId())) {
            return Result.fail("请指定所属工厂");
        }
        if (worker.getTenantId() == null) {
            worker.setTenantId(UserContext.tenantId());
        }
        if (worker.getStatus() == null) {
            worker.setStatus("active");
        }
        if (worker.getDeleteFlag() == null) {
            worker.setDeleteFlag(0);
        }
        if (worker.getId() == null) {
            worker.setCreateTime(LocalDateTime.now());
        }
        worker.setUpdateTime(LocalDateTime.now());
        return Result.success(factoryWorkerService.saveOrUpdate(worker));
    }

    /**
     * 软删除工人
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            FactoryWorker worker = factoryWorkerService.getById(id);
            if (worker == null || !ctxFactoryId.equals(worker.getFactoryId())) {
                return Result.fail("无权删除其他工厂的工人");
            }
        }
        return Result.success(factoryWorkerService.removeById(id));
    }
}
