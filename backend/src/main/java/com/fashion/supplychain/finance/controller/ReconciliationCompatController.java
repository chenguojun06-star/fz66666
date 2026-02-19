package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.dto.IdReasonRequest;
import com.fashion.supplychain.finance.orchestration.OrderProfitOrchestrator;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import javax.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 对账兼容控制器
 * <p>
 * 状态流转委托给 ReconciliationStatusOrchestrator
 * 利润分析委托给 OrderProfitOrchestrator
 */
@RestController
@RequestMapping("/api/finance/reconciliation")
@PreAuthorize("isAuthenticated()")
public class ReconciliationCompatController {

    @Autowired
    private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;

    @Autowired
    private OrderProfitOrchestrator orderProfitOrchestrator;

    @PutMapping("/status")
    public Result<?> updateStatus(@RequestParam("id") String id, @RequestParam("status") String status) {
        String message = reconciliationStatusOrchestrator.updateStatusCompat(id, status);
        return Result.successMessage(message);
    }

    @PostMapping("/return")
    public Result<?> returnToPrevious(@Valid @RequestBody IdReasonRequest body) {
        String message = reconciliationStatusOrchestrator.returnCompat(body.getId(), body.getReason());
        return Result.successMessage(message);
    }

    @GetMapping("/order-profit")
    public Result<?> orderProfit(
            @RequestParam(value = "orderId", required = false) String orderId,
            @RequestParam(value = "orderNo", required = false) String orderNo) {
        Map<String, Object> data = orderProfitOrchestrator.computeOrderProfit(orderId, orderNo);
        return Result.success(data);
    }
}
