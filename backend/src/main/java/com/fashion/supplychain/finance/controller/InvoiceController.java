package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.orchestration.InvoiceOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/finance/invoice")
@PreAuthorize("isAuthenticated()")
public class InvoiceController {

    @Autowired
    private InvoiceOrchestrator invoiceOrchestrator;

    @PreAuthorize("hasAuthority('MENU_FINANCE_INVOICE_VIEW')")
    @PostMapping("/list")
    public Result<IPage<Invoice>> list(@RequestBody Map<String, Object> params) {
        return Result.success(invoiceOrchestrator.list(params));
    }

    @PreAuthorize("hasAuthority('MENU_FINANCE_INVOICE_VIEW')")
    @GetMapping("/{id}")
    public Result<Invoice> getById(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.getById(id));
    }

    @PreAuthorize("hasAuthority('MENU_FINANCE_INVOICE_VIEW')")
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        return Result.success(invoiceOrchestrator.getStats());
    }

    @PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
    @PostMapping("/create")
    public Result<Invoice> create(@RequestBody Invoice invoice) {
        return Result.success(invoiceOrchestrator.create(invoice));
    }

    @PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
    @PutMapping("/update")
    public Result<Invoice> update(@RequestBody Invoice invoice) {
        return Result.success(invoiceOrchestrator.update(invoice));
    }

    @PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
    @PostMapping("/{id}/issue")
    public Result<Invoice> issue(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.issue(id));
    }

    @PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
    @PostMapping("/{id}/cancel")
    public Result<Invoice> cancel(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.cancel(id));
    }

    @PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        invoiceOrchestrator.delete(id);
        return Result.success(null);
    }
}
