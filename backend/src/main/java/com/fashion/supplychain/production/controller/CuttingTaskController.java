package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.orchestration.CuttingBomOrchestrator;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.util.HashMap;
import java.util.List;
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

    @Autowired
    private CuttingBomOrchestrator cuttingBomOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.orchestration.CuttingMaterialUsageOrchestrator materialUsageOrchestrator;

    /**
     * D-823：查询裁剪任务的用料台账（计划/领出/实际/余料，按物料行）
     */
    @GetMapping("/{id}/material-usage")
    public Result<?> materialUsage(@PathVariable String id) {
        return Result.success(materialUsageOrchestrator.listByTask(id));
    }

    /**
     * D-823：登记实际消耗。body: { rows: [{ materialCode, issuedAmount, actualUsed }] }
     * 缺省值：领出=计划量，实际=领出（无余料一键确认）
     */
    @PostMapping("/{id}/material-usage")
    public Result<?> saveMaterialUsage(@PathVariable String id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = body.get("rows") == null
                ? new java.util.ArrayList<>()
                : (List<Map<String, Object>>) body.get("rows");
        return Result.success(materialUsageOrchestrator.saveActual(
                id, rows,
                com.fashion.supplychain.common.UserContext.userId(),
                com.fashion.supplychain.common.UserContext.username()));
    }

    /**
     * D-823：余料回库。body: { rows: [{ materialCode, quantity, warehouseLocation }] }
     * quantity 缺省 = 该行全部余料；支持部分回库。
     */
    @PostMapping("/{id}/remnant-inbound")
    public Result<?> remnantInbound(@PathVariable String id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = body.get("rows") == null
                ? new java.util.ArrayList<>()
                : (List<Map<String, Object>>) body.get("rows");
        return Result.success(materialUsageOrchestrator.remnantInbound(
                id, rows,
                com.fashion.supplychain.common.UserContext.userId(),
                com.fashion.supplychain.common.UserContext.username()));
    }

    /**
     * D-826：查询某裁剪任务已发料的料卷（卷级登记入口）
     */
    @GetMapping("/{id}/material-rolls")
    public Result<?> materialRolls(@PathVariable String id) {
        return Result.success(materialUsageOrchestrator.listRolls(id));
    }

    /**
     * D-826：卷级登记实际消耗。body: { rows: [{ rollId, usedQuantity }] }
     */
    @PostMapping("/{id}/roll-usage")
    public Result<?> saveRollUsage(@PathVariable String id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = body.get("rows") == null
                ? new java.util.ArrayList<>()
                : (List<Map<String, Object>>) body.get("rows");
        return Result.success(materialUsageOrchestrator.saveRollUsage(
                id, rows,
                com.fashion.supplychain.common.UserContext.userId(),
                com.fashion.supplychain.common.UserContext.username()));
    }

    /**
     * D-826：卷级余料回库（生成余料卷 + 入库）。body: { rows: [{ rollId, quantity, warehouseLocation }] }
     */
    @PostMapping("/{id}/roll-remnant-inbound")
    public Result<?> rollRemnantInbound(@PathVariable String id, @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = body.get("rows") == null
                ? new java.util.ArrayList<>()
                : (List<Map<String, Object>>) body.get("rows");
        return Result.success(materialUsageOrchestrator.remnantInboundByRoll(
                id, rows,
                com.fashion.supplychain.common.UserContext.userId(),
                com.fashion.supplychain.common.UserContext.username()));
    }

    /**
     * D-823：采购↔裁剪全链路汇总（采购-到货-已用-剩余 ↔ 计划-领出-实际-余料-已回库）
     */
    @GetMapping("/material-usage-chain")
    public Result<?> materialUsageChain(@RequestParam String orderNo,
            @RequestParam(required = false) String materialCode) {
        return Result.success(materialUsageOrchestrator.chainSummary(orderNo, materialCode));
    }

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
    @GetMapping
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
     * 按款号查询裁剪任务列表（RESTful：使用子资源路径 /by-style/{styleNo}）
     */
    @GetMapping("/by-style/{styleNo}")
    public Result<?> listByStyleNo(@PathVariable String styleNo) {
        return doListByStyle(styleNo);
    }

    private Result<?> doListByStyle(String styleNo) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        List<com.fashion.supplychain.production.entity.CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .eq(com.fashion.supplychain.production.entity.CuttingTask::getStyleNo, styleNo)
                .eq(tenantId != null, com.fashion.supplychain.production.entity.CuttingTask::getTenantId, tenantId)
                .orderByDesc(com.fashion.supplychain.production.entity.CuttingTask::getCreateTime)
                .list();
        List<com.fashion.supplychain.production.entity.CuttingBom> bomList = cuttingBomOrchestrator.listByStyleNo(styleNo);
        Map<String, Object> result = new HashMap<>();
        result.put("tasks", tasks);
        result.put("bomList", bomList);
        return Result.success(result);
    }

}
