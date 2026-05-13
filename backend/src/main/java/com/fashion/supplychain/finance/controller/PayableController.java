package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.orchestration.PayableOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 应付账款 Controller — 应付单的增删改查与状态管理。
 *
 * <p>注意：{@code POST /create} 为旧式端点，已标记为 @Deprecated，
 * 计划于 2026-Q3 移除。请迁移到 {@code POST /api/finance/payable}（空路径）。</p>
 */
@RestController
@RequestMapping("/api/finance/payable")
@PreAuthorize("isAuthenticated()")
public class PayableController {

    @Autowired
    private PayableOrchestrator payableOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<IPage<Payable>> list(@RequestBody Map<String, Object> params) {
        return Result.success(payableOrchestrator.list(params));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<Payable> getById(@PathVariable String id) {
        return Result.success(payableOrchestrator.getById(id));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        return Result.success(payableOrchestrator.getStats());
    }

    /**
     * @deprecated 使用 {@code POST /} 替代（计划于 2026-Q3 移除）
     */
    @Deprecated
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/create")
    public Result<Payable> create(@RequestBody Payable payable) {
        return Result.success(payableOrchestrator.create(payable));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/mark-paid")
    public Result<Payable> markPaid(@PathVariable String id,
                                    @RequestParam(required = false) BigDecimal amount) {
        return Result.success(payableOrchestrator.markPaid(id, amount));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/mark-overdue")
    public Result<Integer> markOverdue() {
        return Result.success(payableOrchestrator.markOverdue());
    }

    @PreAuthorize("isAuthenticated()")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        payableOrchestrator.delete(id);
        return Result.success(null);
    }
}
