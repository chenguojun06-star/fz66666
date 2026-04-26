package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.orchestration.FinancialReportOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/report")
@PreAuthorize("isAuthenticated()")
public class FinancialReportController {

    @Autowired
    private FinancialReportOrchestrator financialReportOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/profit-loss")
    public Result<Map<String, Object>> profitLoss(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return Result.success(financialReportOrchestrator.generateProfitLoss(startDate, endDate));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/balance-sheet")
    public Result<Map<String, Object>> balanceSheet(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOfDate) {
        return Result.success(financialReportOrchestrator.generateBalanceSheet(asOfDate));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/cash-flow")
    public Result<Map<String, Object>> cashFlow(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return Result.success(financialReportOrchestrator.generateCashFlow(startDate, endDate));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/aging-analysis")
    public Result<Map<String, Object>> agingAnalysis(
            @RequestParam(required = false, defaultValue = "RECEIVABLE") String type) {
        return Result.success(financialReportOrchestrator.generateAgingAnalysis(type));
    }
}
