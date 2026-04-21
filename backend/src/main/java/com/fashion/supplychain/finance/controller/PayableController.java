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

@RestController
@RequestMapping("/api/finance/payable")
@PreAuthorize("isAuthenticated()")
public class PayableController {

    @Autowired
    private PayableOrchestrator payableOrchestrator;

    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYABLE_VIEW')")
    @PostMapping("/list")
    public Result<IPage<Payable>> list(@RequestBody Map<String, Object> params) {
        return Result.success(payableOrchestrator.list(params));
    }

    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYABLE_VIEW')")
    @GetMapping("/{id}")
    public Result<Payable> getById(@PathVariable String id) {
        return Result.success(payableOrchestrator.getById(id));
    }

    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYABLE_VIEW')")
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        return Result.success(payableOrchestrator.getStats());
    }

    @PreAuthorize("hasAuthority('FINANCE_PAYABLE_MANAGE')")
    @PostMapping("/create")
    public Result<Payable> create(@RequestBody Payable payable) {
        return Result.success(payableOrchestrator.create(payable));
    }

    @PreAuthorize("hasAuthority('FINANCE_PAYABLE_MANAGE')")
    @PostMapping("/{id}/mark-paid")
    public Result<Payable> markPaid(@PathVariable String id,
                                    @RequestParam(required = false) BigDecimal amount) {
        return Result.success(payableOrchestrator.markPaid(id, amount));
    }

    @PreAuthorize("hasAuthority('FINANCE_PAYABLE_MANAGE')")
    @PostMapping("/mark-overdue")
    public Result<Integer> markOverdue() {
        return Result.success(payableOrchestrator.markOverdue());
    }

    @PreAuthorize("hasAuthority('FINANCE_PAYABLE_MANAGE')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        payableOrchestrator.delete(id);
        return Result.success(null);
    }
}
