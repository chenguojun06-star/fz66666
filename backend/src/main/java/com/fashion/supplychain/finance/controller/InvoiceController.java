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

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<IPage<Invoice>> list(@RequestBody Map<String, Object> params) {
        return Result.success(invoiceOrchestrator.list(params));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}")
    public Result<Invoice> getById(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.getById(id));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stats")
    public Result<Map<String, Object>> stats() {
        return Result.success(invoiceOrchestrator.getStats());
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/create")
    public Result<Invoice> create(@RequestBody Invoice invoice) {
        return Result.success(invoiceOrchestrator.create(invoice));
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/update")
    public Result<Invoice> update(@RequestBody Invoice invoice) {
        return Result.success(invoiceOrchestrator.update(invoice));
    }

    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/issue")
    public Result<Invoice> issue(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.issue(id));
    }

    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/cancel")
    public Result<Invoice> cancel(@PathVariable String id) {
        return Result.success(invoiceOrchestrator.cancel(id));
    }

    @PreAuthorize("hasAnyAuthority('ROLE_admin', 'ROLE_ADMIN', 'ROLE_1', 'ROLE_tenant_owner', 'ROLE_管理员', 'ROLE_主管', 'ROLE_SUPER_ADMIN')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        invoiceOrchestrator.delete(id);
        return Result.success(null);
    }
}
