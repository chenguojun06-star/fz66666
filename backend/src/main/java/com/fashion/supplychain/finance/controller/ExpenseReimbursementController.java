package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.orchestration.ExpenseReimbursementOrchestrator;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

import java.util.Map;

/**
 * 费用报销 Controller
 * 提供报销单的CRUD和审批流程API
 */
@Slf4j
@RestController
@RequestMapping("/api/finance/expense-reimbursement")
@PreAuthorize("isAuthenticated()")
public class ExpenseReimbursementController {

    @Autowired
    private ExpenseReimbursementOrchestrator orchestrator;

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    /**
     * 分页查询报销单列表
     * 支持参数：page, size, applicantId, status, expenseType, reimbursementNo, keyword
     */
    @GetMapping("/list")
    public Result<IPage<ExpenseReimbursement>> list(@RequestParam Map<String, Object> params) {
        IPage<ExpenseReimbursement> page = expenseReimbursementService.queryPage(params);
        return Result.success(page);
    }

    /**
     * 查询报销单详情
     */
    @GetMapping("/{id}")
    public Result<ExpenseReimbursement> getById(@PathVariable String id) {
        ExpenseReimbursement entity = expenseReimbursementService.getById(id);
        if (entity == null) {
            return Result.fail("报销单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(entity.getTenantId(), "报销单");
        return Result.success(entity);
    }

    /**
     * 创建报销单
     */
    @PostMapping
    public Result<ExpenseReimbursement> create(@RequestBody ExpenseReimbursement entity) {
        try {
            ExpenseReimbursement created = orchestrator.createReimbursement(entity);
            return Result.success(created);
        } catch (Exception e) {
            log.error("创建报销单失败", e);
            return Result.fail("创建失败: " + e.getMessage());
        }
    }

    /**
     * 更新报销单
     */
    @PutMapping
    public Result<ExpenseReimbursement> update(@RequestBody ExpenseReimbursement entity) {
        try {
            ExpenseReimbursement updated = orchestrator.updateReimbursement(entity);
            return Result.success(updated);
        } catch (Exception e) {
            log.error("更新报销单失败", e);
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    /**
     * 删除报销单（软删除）
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        try {
            orchestrator.deleteReimbursement(id);
            return Result.success(true);
        } catch (Exception e) {
            log.error("删除报销单失败", e);
            return Result.fail("删除失败: " + e.getMessage());
        }
    }

    /**
     * 审批操作（批准/驳回）
     * action: approve=批准, reject=驳回
     */
    @PostMapping("/{id}/approve")
    public Result<ExpenseReimbursement> approve(
            @PathVariable String id,
            @RequestParam String action,
            @RequestParam(required = false) String remark) {
        try {
            ExpenseReimbursement result = orchestrator.approveReimbursement(id, action, remark);
            return Result.success(result);
        } catch (Exception e) {
            log.error("审批报销单失败", e);
            return Result.fail("审批失败: " + e.getMessage());
        }
    }

    /**
     * 确认付款
     */
    @PostMapping("/{id}/pay")
    public Result<ExpenseReimbursement> pay(
            @PathVariable String id,
            @RequestParam(required = false) String remark) {
        try {
            ExpenseReimbursement result = orchestrator.confirmPayment(id, remark);
            return Result.success(result);
        } catch (Exception e) {
            log.error("付款失败", e);
            return Result.fail("付款失败: " + e.getMessage());
        }
    }
}
