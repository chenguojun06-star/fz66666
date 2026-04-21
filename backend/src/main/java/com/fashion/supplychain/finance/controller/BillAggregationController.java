package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillPushRequest;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillQueryRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/bill-aggregation")
@PreAuthorize("isAuthenticated()")
public class BillAggregationController {

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    /** 推送账单（各模块内部调用，也可手动触发） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/push")
    public Result<BillAggregation> pushBill(@RequestBody BillPushRequest request) {
        return Result.success(billAggregationOrchestrator.pushBill(request));
    }

    /** 分页查询账单列表 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<Page<BillAggregation>> listBills(@RequestBody BillQueryRequest query) {
        return Result.success(billAggregationOrchestrator.listBills(query));
    }

    /** 统计各状态汇总 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/stats")
    public Result<Map<String, Object>> getStats(@RequestParam(required = false) String billType) {
        return Result.success(billAggregationOrchestrator.getStats(billType));
    }

    /** 确认账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/confirm")
    public Result<Void> confirmBill(@PathVariable String id) {
        billAggregationOrchestrator.confirmBill(id);
        return Result.success(null);
    }

    /** 批量确认 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-confirm")
    public Result<Integer> batchConfirm(@RequestBody List<String> billIds) {
        return Result.success(billAggregationOrchestrator.batchConfirm(billIds));
    }

    /** 结清账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/settle")
    public Result<Void> settleBill(@PathVariable String id,
                                   @RequestParam(required = false) BigDecimal settledAmount) {
        billAggregationOrchestrator.settleBill(id, settledAmount);
        return Result.success(null);
    }

    /** 取消账单 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancelBill(@PathVariable String id,
                                   @RequestParam(required = false) String reason) {
        billAggregationOrchestrator.cancelBill(id, reason);
        return Result.success(null);
    }
}
