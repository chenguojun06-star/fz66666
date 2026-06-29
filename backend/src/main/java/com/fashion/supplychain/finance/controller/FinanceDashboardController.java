package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.orchestration.FinanceDashboardHelper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 财务总览控制器
 * <p>
 * 统一聚合财务模块各业务表的统计、趋势、成本结构与明细数据。
 * 数据源：Payable / EcSalesRevenue / MaterialReconciliation / WagePayment /
 *        ExpenseReimbursement / EmployeeAdvance / ShipmentReconciliation
 * 全部带 tenant_id 过滤（P0 铁律 #4）。
 */
@Tag(name = "财务总览", description = "财务模块统一看板")
@RestController
@RequestMapping("/api/finance/dashboard")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class FinanceDashboardController {

    private final FinanceDashboardHelper financeDashboardHelper;

    @Operation(summary = "财务总览汇总数据（含指标卡、趋势、成本结构、明细列表）")
    @GetMapping("/summary")
    public Result<Map<String, Object>> summary(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(financeDashboardHelper.buildDashboardSummary(startDate, endDate));
    }
}
