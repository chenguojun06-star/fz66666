package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/production/warehousing")
@PreAuthorize("isAuthenticated()")
public class ProductWarehousingController {

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ProductWarehousing> page = productWarehousingOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 质检入库状态统计
     * 返回：totalCount, totalOrders, totalQuantity, qualifiedCount, qualifiedQuantity,
     *       unqualifiedCount, unqualifiedQuantity, todayCount, todayOrders, todayQuantity,
     *       pendingQcOrders, pendingQcQuantity
     */
    @GetMapping("/stats")
    public Result<?> stats(@RequestParam(required = false) Map<String, Object> params) {
        return Result.success(productWarehousingOrchestrator.getStatusStats(params));
    }

    /**
     * 查询各状态的待处理菲号列表
     * @param status pendingQc(待质检) | pendingPackaging(待包装) | pendingWarehouse(待入库)
     */
    @GetMapping("/pending-bundles")
    public Result<?> listPendingBundles(@RequestParam String status) {
        return Result.success(productWarehousingOrchestrator.listPendingBundles(status));
    }

    /**
     * 查询指定订单下各菲号的扫码就绪状态
     * 用于质检/入库详情页控制哪些菲号可操作
     * 返回 qcReadyQrs（可质检菲号QR列表）和 warehouseReadyQrs（可入库菲号QR列表）
     */
    @GetMapping("/bundle-readiness")
    public Result<?> getBundleReadiness(@RequestParam String orderId) {
        return Result.success(productWarehousingOrchestrator.getBundleReadiness(orderId));
    }

    /**
     * 质检简报：返回订单关键信息、BOM、尺寸规格、质检注意事项
     * 供质检详情页右侧面板使用
     */
    @GetMapping("/quality-briefing/{orderId}")
    public Result<?> getQualityBriefing(@PathVariable String orderId) {
        return Result.success(productWarehousingOrchestrator.getQualityBriefing(orderId));
    }

    @GetMapping("/{id}")
    public Result<ProductWarehousing> getById(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.save(productWarehousing));
    }

    @PostMapping("/batch")
    public Result<?> batchSave(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.batchSave(body));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody ProductWarehousing productWarehousing) {
        return Result.success(productWarehousingOrchestrator.update(productWarehousing));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(productWarehousingOrchestrator.delete(id));
    }

    @PostMapping("/rollback-by-bundle")
    public Result<?> rollbackByBundle(@RequestBody Map<String, Object> body) {
        return Result.success(productWarehousingOrchestrator.rollbackByBundle(body));
    }

    /**
     * 统一的报修统计端点（支持单个和批量）
     *
     * @param params 查询参数（GET方式，用于单个查询）
     * @param body 请求体（POST方式，用于批量查询）
     * @return 统计结果
     */
    @RequestMapping(value = "/repair-stats", method = {RequestMethod.GET, RequestMethod.POST})
    public Result<?> repairStats(
            @RequestParam(required = false) Map<String, Object> params,
            @RequestBody(required = false) Map<String, Object> body) {

        // 智能路由：根据请求方式和参数选择单个或批量处理
        if (body != null && !body.isEmpty()) {
            // POST请求 + body存在 = 批量处理
            return Result.success(productWarehousingOrchestrator.batchRepairStats(body));
        } else {
            // GET请求或POST无body = 单个处理
            return Result.success(productWarehousingOrchestrator.repairStats(params != null ? params : body));
        }
    }

    /**
     * @deprecated 请使用 POST /repair-stats（统一端点支持批量）
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/repair-stats/batch")
    public Result<?> batchRepairStats(@RequestBody Map<String, Object> body) {
        return repairStats(null, body);
    }
}
