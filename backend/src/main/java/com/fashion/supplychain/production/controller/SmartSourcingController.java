package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.service.SmartSourcingService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 智能采购推荐 Controller
 *
 * 基于订单BOM物料需求 → 净需求计算 → 供应商推荐 → 推送购物车草稿
 */
@RestController
@RequestMapping("/api/production/smart-sourcing")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class SmartSourcingController {

    @Autowired
    private SmartSourcingService smartSourcingService;

    /**
     * 为单个订单生成智能采购建议（推送到购物车草稿）
     */
    @PostMapping("/generate/{orderNo}")
    public Result<Map<String, Object>> generateForOrder(@PathVariable String orderNo) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = smartSourcingService.generateSourcingForOrder(tenantId, orderNo);
        return Result.success(result);
    }

    /**
     * 批量为多个订单生成智能采购建议
     */
    @PostMapping("/generate-batch")
    public Result<Map<String, Object>> generateForOrders(@RequestBody List<String> orderNos) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = smartSourcingService.generateSourcingForOrders(tenantId, orderNos);
        return Result.success(result);
    }

    /**
     * 查询订单的物料净需求（不写入购物车，仅预览）
     */
    @GetMapping("/net-demand/{orderNo}")
    public Result<List<Map<String, Object>>> getNetDemand(@PathVariable String orderNo) {
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> demand = smartSourcingService.calculateNetDemand(tenantId, orderNo);
        return Result.success(demand);
    }
}
