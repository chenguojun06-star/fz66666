package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.smart.SmartSourcingFilter;
import com.fashion.supplychain.production.dto.smart.SmartSourcingOrdersPage;
import com.fashion.supplychain.production.dto.smart.SmartSourcingOverviewResponse;
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

    // ==================== 升级方案A：订单列表 + 按需批量计算 + 2h缓存 ====================

    /**
     * 智能采购订单列表（轻量，1次SQL，仅查订单表，不做净需求计算）
     * <p>打开智能采购面板时前端先调这个，拿到订单列表后再按需（勾选/当前页）调 orders-overview 计算
     *
     * @param filter 筛选条件（全部可选，后端有默认值 + clamp 硬保护）
     * @return 当前页订单基本信息 + 符合条件总数 + 实际生效筛选值
     */
    @PostMapping("/orders")
    public Result<SmartSourcingOrdersPage> listOrders(@RequestBody(required = false) SmartSourcingFilter filter) {
        Long tenantId = UserContext.tenantId();
        return Result.success(smartSourcingService.listOrders(tenantId, filter));
    }

    /**
     * 批量订单概览（缺料汇总，8步批量SQL优化，结果缓存2小时）
     * <p>前端在拿到订单列表后：①勾选N个订单"批量计算"，或 ②当前页自动计算
     * <p>硬限制：单次最多 20 个订单（数据库防炸保护）
     *
     * @param body orderNos(必填), forceRefresh(可选,默认false)
     */
    @PostMapping("/orders-overview")
    public Result<SmartSourcingOverviewResponse> buildOverviewsBatch(
            @RequestBody Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        @SuppressWarnings("unchecked")
        List<String> orderNos = (List<String>) body.get("orderNos");
        boolean forceRefresh = Boolean.TRUE.equals(body.get("forceRefresh"));
        return Result.success(smartSourcingService.buildOverviewsBatch(tenantId, orderNos, forceRefresh));
    }

    /**
     * 单订单物料明细（同 net-demand 结构，但读 Caffeine 2h 缓存）
     * <p>用户点订单行"查看详情"时调用；传 forceRefresh=true 忽略缓存重算（详情页刷新按钮）
     */
    @GetMapping("/orders-detail/{orderNo}")
    public Result<List<Map<String, Object>>> getOrderDetailCached(
            @PathVariable String orderNo,
            @RequestParam(defaultValue = "false") boolean forceRefresh) {
        Long tenantId = UserContext.tenantId();
        return Result.success(smartSourcingService.getOrderDetailCached(tenantId, orderNo, forceRefresh));
    }
}
