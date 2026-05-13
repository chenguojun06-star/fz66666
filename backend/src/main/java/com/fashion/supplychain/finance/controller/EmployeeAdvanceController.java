package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;
import com.fashion.supplychain.finance.orchestration.EmployeeAdvanceOrchestrator;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/finance/employee-advance")
@PreAuthorize("isAuthenticated()")
public class EmployeeAdvanceController {

    @Autowired
    private EmployeeAdvanceOrchestrator employeeAdvanceOrchestrator;

    @PostMapping("/list")
    public Result<IPage<EmployeeAdvance>> list(@RequestBody Map<String, Object> params) {
        return Result.success(employeeAdvanceOrchestrator.list(params));
    }

    @PostMapping
    public Result<EmployeeAdvance> create(@RequestBody EmployeeAdvance advance) {
        return Result.success(employeeAdvanceOrchestrator.create(advance));
    }

    @PutMapping("/{id}/approve")
    public Result<Void> approve(@PathVariable String id, @RequestBody Map<String, String> body) {
        employeeAdvanceOrchestrator.approve(id, body != null ? body.get("remark") : null);
        return Result.success();
    }

    @PutMapping("/{id}/reject")
    public Result<Void> reject(@PathVariable String id, @RequestBody Map<String, String> body) {
        employeeAdvanceOrchestrator.reject(id, body != null ? body.get("remark") : null);
        return Result.success();
    }

    @PutMapping("/{id}/repay")
    public Result<Void> repay(@PathVariable String id, @RequestBody Map<String, Object> body) {
        BigDecimal amount = body != null && body.get("amount") != null
                ? new BigDecimal(String.valueOf(body.get("amount")))
                : null;
        employeeAdvanceOrchestrator.repay(id, amount);
        return Result.success();
    }
}
