package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.finance.orchestration.FactoryReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationBackfillOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * 加工厂对账控制器
 */
@RestController
@RequestMapping("/api/finance/factory-reconciliation")
public class FactoryReconciliationController {

    @Autowired
    private FactoryReconciliationOrchestrator factoryReconciliationOrchestrator;

    @Autowired
    private ReconciliationBackfillOrchestrator reconciliationBackfillOrchestrator;

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    /**
     * 分页查询加工厂对账列表
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<FactoryReconciliation> page = factoryReconciliationOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 根据ID查询加工厂对账详情
     */
    @GetMapping("/detail/{id}")
    public Result<?> detail(@PathVariable String id) {
        return Result.success(factoryReconciliationOrchestrator.detail(id));
    }

    /**
     * 保存或更新加工厂对账
     */
    @PostMapping
    public Result<?> add(@RequestBody Map<String, Object> params) {
        factoryReconciliationOrchestrator.add(params);
        return Result.successMessage("操作成功");
    }

    /**
     * 更新加工厂对账
     */
    @PutMapping
    public Result<?> update(@RequestBody Map<String, Object> params) {
        factoryReconciliationOrchestrator.update(params);
        return Result.successMessage("操作成功");
    }

    /**
     * 保存或更新加工厂对账（兼容旧版本）
     */
    @PostMapping("/save")
    public Result<?> save(@RequestBody Map<String, Object> params) {
        factoryReconciliationOrchestrator.saveCompat(params);
        return Result.successMessage("操作成功");
    }

    /**
     * 根据ID删除加工厂对账
     */
    @DeleteMapping("/delete/{id}")
    public Result<?> delete(@PathVariable String id) {
        factoryReconciliationOrchestrator.delete(id);
        return Result.successMessage("删除成功");
    }

    /**
     * 更新对账状态
     */
    @PostMapping("/update-status")
    public Result<?> updateStatus(@RequestBody Map<String, Object> params) {
        String id = (String) params.get("id");
        String status = (String) params.get("status");
        String message = reconciliationStatusOrchestrator.updateFactoryStatus(id, status);
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@RequestBody Map<String, Object> params) {
        String id = (String) params.get("id");
        String reason = (String) params.get("reason");
        String message = reconciliationStatusOrchestrator.returnFactoryToPrevious(id, reason);
        return Result.successMessage(message);
    }

    /**
     * 根据ID查询扣款项列表
     */
    @GetMapping("/deduction-items/{reconciliationId}")
    public Result<?> getDeductionItems(@PathVariable String reconciliationId) {
        return Result.success(factoryReconciliationOrchestrator.getDeductionItems(reconciliationId));
    }

    @PostMapping("/backfill")
    public Result<?> backfill() {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管级别及以上可执行补数据");
        }
        int touched = reconciliationBackfillOrchestrator.backfillFinanceRecords();
        return Result.success(touched);
    }

    @PostMapping("/backfill-all")
    public Result<?> backfillAll() {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管级别及以上可执行补数据");
        }
        return Result.success(reconciliationBackfillOrchestrator.backfillAll());
    }
}
