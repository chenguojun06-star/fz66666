package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.orchestration.TaxConfigOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/finance/tax-config")
@PreAuthorize("isAuthenticated()")
public class TaxConfigController {

    @Autowired
    private TaxConfigOrchestrator taxConfigOrchestrator;

    @GetMapping("/list")
    public Result<List<TaxConfig>> listAll() {
        return Result.success(taxConfigOrchestrator.listAll());
    }

    @GetMapping("/active")
    public Result<List<TaxConfig>> listActive() {
        return Result.success(taxConfigOrchestrator.listActive());
    }

    @PostMapping("/create")
    public Result<TaxConfig> create(@RequestBody TaxConfig config) {
        return Result.success(taxConfigOrchestrator.create(config));
    }

    @PutMapping("/update")
    public Result<TaxConfig> update(@RequestBody TaxConfig config) {
        return Result.success(taxConfigOrchestrator.update(config));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable String id) {
        taxConfigOrchestrator.delete(id);
        return Result.success(null);
    }

    @GetMapping("/calc")
    public Result<BigDecimal> calcTax(@RequestParam BigDecimal amount, @RequestParam String taxCode) {
        return Result.success(taxConfigOrchestrator.calcTax(amount, taxCode));
    }
}
