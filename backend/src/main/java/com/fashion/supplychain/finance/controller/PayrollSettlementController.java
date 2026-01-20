package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/finance/payroll-settlement")
public class PayrollSettlementController {

    @Autowired
    private PayrollSettlementOrchestrator payrollSettlementOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<PayrollSettlement> page = payrollSettlementOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/detail/{id}")
    public Result<?> detail(@PathVariable String id) {
        return Result.success(payrollSettlementOrchestrator.detail(id));
    }

    @GetMapping("/items/{settlementId}")
    public Result<?> items(@PathVariable String settlementId) {
        return Result.success(payrollSettlementOrchestrator.items(settlementId));
    }

    @PostMapping("/operator-summary")
    public Result<?> operatorSummary(@RequestBody Map<String, Object> params) {
        return Result.success(payrollSettlementOrchestrator.operatorSummary(params));
    }

    @PostMapping("/generate")
    public Result<?> generate(@RequestBody Map<String, Object> params) {
        return Result.success(payrollSettlementOrchestrator.generate(params));
    }
}
