package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.orchestration.FinancePeriodOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/finance/period")
@RequiredArgsConstructor
public class FinancePeriodController {

    private final FinancePeriodOrchestrator periodOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(@RequestParam(required = false) Integer year) {
        return periodOrchestrator.list(year);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/lock")
    public Result<?> lock(@RequestBody Map<String, Object> params) {
        Integer year = (Integer) params.get("year");
        Integer month = (Integer) params.get("month");
        String remark = (String) params.get("remark");
        if (year == null || month == null) {
            return Result.fail("年月不能为空");
        }
        return periodOrchestrator.lock(year, month, remark);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/unlock")
    public Result<?> unlock(@RequestBody Map<String, Object> params) {
        Integer year = (Integer) params.get("year");
        Integer month = (Integer) params.get("month");
        if (year == null || month == null) {
            return Result.fail("年月不能为空");
        }
        return periodOrchestrator.unlock(year, month);
    }
}
