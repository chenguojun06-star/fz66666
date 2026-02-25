package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/production/cutting-task")
@PreAuthorize("isAuthenticated()")
public class CuttingTaskController {

    @Autowired
    private CuttingTaskOrchestrator cuttingTaskOrchestrator;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    /**
     * 裁剪任务状态统计
     * 返回各状态数量：totalCount, pendingCount, receivedCount, bundledCount, totalQuantity
     */
    @GetMapping("/stats")
    public Result<?> stats(@RequestParam(required = false) Map<String, Object> params) {
        return Result.success(cuttingTaskOrchestrator.getStatusStats(params));
    }

    /**
     * 【新版统一查询】分页查询裁剪任务列表
     * 支持参数：
     * - myTasks: true表示查询当前用户的裁剪任务
     * - 其他筛选参数：orderId, status等
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 智能路由：我的任务
        if ("true".equals(String.valueOf(params.get("myTasks")))) {
            return Result.success(cuttingTaskOrchestrator.getMyTasks());
        }

        return Result.success(cuttingTaskOrchestrator.queryPage(params));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.receive(body));
    }

    @PostMapping("/rollback")
    public Result<?> rollback(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.rollback(body));
    }

    @PostMapping("/custom/create")
    public Result<?> createCustom(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.createCustom(body));
    }

    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        String id = payload.get("id") != null ? String.valueOf(payload.get("id")) : null;
        if (id == null || id.trim().isEmpty()) {
            return Result.fail("缺少id参数");
        }

        com.fashion.supplychain.production.entity.CuttingTask task = cuttingTaskService.getById(id);
        if (task == null) {
            return Result.fail("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪单");

        if (payload.containsKey("remarks")) {
            task.setRemarks(String.valueOf(payload.get("remarks")));
        }

        // ⚠️ 用 LambdaUpdateWrapper 显式处理，确保 null 值能真正写入数据库
        com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<com.fashion.supplychain.production.entity.CuttingTask> qeUw =
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
        qeUw.eq(com.fashion.supplychain.production.entity.CuttingTask::getId, task.getId());
        if (payload.containsKey("remarks")) {
            qeUw.set(com.fashion.supplychain.production.entity.CuttingTask::getRemarks,
                    String.valueOf(payload.get("remarks")));
        }
        if (payload.containsKey("expectedShipDate")) {
            Object val = payload.get("expectedShipDate");
            java.time.LocalDate dateVal = (val != null && !String.valueOf(val).trim().isEmpty())
                    ? java.time.LocalDate.parse(String.valueOf(val)) : null;
            qeUw.set(com.fashion.supplychain.production.entity.CuttingTask::getExpectedShipDate, dateVal);
        }
        boolean success = cuttingTaskService.update(qeUw);
        return success ? Result.success("更新成功") : Result.fail("更新失败");
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?myTasks=true
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/my-tasks")
    public Result<?> getMyTasks() {
        return Result.success(cuttingTaskOrchestrator.getMyTasks());
    }
}
