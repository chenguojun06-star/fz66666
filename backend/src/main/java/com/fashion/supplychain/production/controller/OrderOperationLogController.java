package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.OrderOperationLog;
import com.fashion.supplychain.production.service.OrderOperationLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/order/operation-log")
@PreAuthorize("isAuthenticated()")
public class OrderOperationLogController {

    @Autowired
    private OrderOperationLogService orderOperationLogService;

    @GetMapping("/list")
    public Result<List<OrderOperationLog>> list(
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) String action) {
        return Result.success(orderOperationLogService.listByOrder(orderNo, orderId, action));
    }
}