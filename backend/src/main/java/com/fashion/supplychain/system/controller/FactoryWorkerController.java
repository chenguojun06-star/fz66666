package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.FactoryWorker;
import com.fashion.supplychain.system.orchestration.FactoryWorkerOrchestrator;
import com.fashion.supplychain.system.service.FactoryWorkerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 外发工厂工人管理（工厂账号管理其工人名册，扫码时从名册选人）。
 * <p>写操作（新增/更新/保存/删除）已统一委托给 {@link FactoryWorkerOrchestrator}，
 * 由 Orchestrator 负责事务保护和租户上下文校验。查询方法保留直接调用 Service。
 */
@RestController
@RequestMapping("/api/factory-worker")
@PreAuthorize("isAuthenticated()")
public class FactoryWorkerController {

    @Autowired
    private FactoryWorkerService factoryWorkerService;

    @Autowired
    private FactoryWorkerOrchestrator factoryWorkerOrchestrator;

    /**
     * 查询工人列表。
     * <ul>
     *     <li>外发工厂账号：只能看自已工厂的工人（factoryId 取自 UserContext）</li>
     *     <li>租户管理员：可传 factoryId 参数查询指定工厂，否则返回本租户所有工人</li>
     * </ul>
     */
    @GetMapping("/list")
    public Result<List<FactoryWorker>> list(
            @RequestParam(required = false) String factoryId,
            @RequestParam(required = false) String status) {
        QueryWrapper<FactoryWorker> wrapper = new QueryWrapper<>();
        wrapper.eq("delete_flag", 0);
        wrapper.eq("tenant_id", UserContext.tenantId());

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
        wrapper.last("LIMIT 5000");

        return Result.success(factoryWorkerService.list(wrapper));
    }

    /**
     * 新增工人。
     * <p>自动绑定当前用户的 tenantId 和 factoryId。
     */
    @PostMapping
    public Result<FactoryWorker> create(@RequestBody FactoryWorker worker) {
        return Result.success(factoryWorkerOrchestrator.create(worker));
    }

    /**
     * 更新工人。
     */
    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable String id, @RequestBody FactoryWorker worker) {
        return Result.success(factoryWorkerOrchestrator.update(id, worker));
    }

    /** @deprecated 使用 POST / 或 PUT /{id} 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @PostMapping("/save")
    public Result<Boolean> save(@RequestBody FactoryWorker worker) {
        return Result.success(factoryWorkerOrchestrator.save(worker));
    }

    /**
     * 软删除工人。
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(factoryWorkerOrchestrator.delete(id));
    }
}
