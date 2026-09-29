package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.InternalMaintenanceOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 内部维护工具Controller - 仅用于数据修复
 * ⚠️ 警告：
 * 1. 此Controller仅供管理员使用
 * 2. 生产环境使用前请备份数据
 * 3. 完成数据修复后建议删除或禁用此Controller
 *
 * <p>D-636：原先本类直接注入了 ProductionOrderService 并在最外层做「订单解析 + 批量遍历 +
 * 逐单 try/catch 计数 + 调用两个 Orchestrator」，属跨服务编排泄漏到最外层。业务逻辑已
 * 下沉到 {@link InternalMaintenanceOrchestrator}；顺带删除两个声明了但全类从未使用的
 * 死注入（ProductWarehousingService、ProductSkuService）。本类只保留端点声明与请求参数拆包。
 */
@RestController
@RequestMapping("/api/internal/maintenance")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class InternalMaintenanceController {

    @Autowired
    private InternalMaintenanceOrchestrator internalMaintenanceOrchestrator;

    /**
     * 批量同步所有订单的工序单价
     *
     * 使用方法：
     * curl -X POST http://localhost:8088/api/internal/maintenance/sync-all-unit-prices
     *
     * ⚠️ 注意：
     * 1. 此操作会遍历所有订单，可能耗时较长
     * 2. 建议在业务低峰期执行
     * 3. 执行前请备份数据库
     *
     * @return 同步结果统计
     */
    @PostMapping("/sync-all-unit-prices")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")  // 仅超级管理员可执行
    public Result<?> syncAllUnitPrices() {
        return internalMaintenanceOrchestrator.syncAllUnitPrices();
    }

    /**
     * 同步单个订单的工序单价
     *
     * 使用方法：
     * curl -X POST http://localhost:8088/api/internal/maintenance/sync-unit-prices \
     *   -H "Content-Type: application/json" \
     *   -d '{"orderId":"xxx"}'
     *
     * 或：
     * curl -X POST http://localhost:8088/api/internal/maintenance/sync-unit-prices \
     *   -H "Content-Type: application/json" \
     *   -d '{"orderNo":"PO20260206001"}'
     *
     * @param payload 请求参数（orderId 或 orderNo）
     * @return 同步结果
     */
    @PostMapping("/sync-unit-prices")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> syncUnitPrices(@RequestBody Map<String, Object> payload) {
        String orderId = (String) payload.get("orderId");
        String orderNo = (String) payload.get("orderNo");
        return internalMaintenanceOrchestrator.syncUnitPrices(orderId, orderNo);
    }

    /**
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价
     * 从模板库读取最新单价，更新到订单的 progressWorkflowJson 字段
     *
     * ⚠️ 注意：仅更新非已完成的订单
     */
    @PostMapping("/refresh-workflow-prices")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> refreshWorkflowPrices() {
        return internalMaintenanceOrchestrator.refreshWorkflowPrices();
    }

    /**
     * 检查单价不一致的订单
     *
     * 使用方法：
     * curl -X GET http://localhost:8088/api/internal/maintenance/check-price-inconsistency
     *
     * @return 不一致的订单列表
     */
    @GetMapping("/check-price-inconsistency")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> checkPriceInconsistency() {
        return Result.success("检查功能开发中，请使用 ./check-price-flow.sh 脚本");
    }

    /**
     * 批量同步工序跟踪表 (t_production_process_tracking) 中的单价
     * 从模板库读取最新单价，更新到跟踪记录的 unit_price 字段
     * 同时重新计算已扫码记录的结算金额
     *
     * 使用方法：
     * curl -X POST http://localhost:8088/api/internal/maintenance/refresh-tracking-prices \
     *   -H "Authorization: Bearer {token}"
     */
    @PostMapping("/refresh-tracking-prices")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> refreshTrackingPrices() {
        return internalMaintenanceOrchestrator.refreshTrackingPrices();
    }

    /**
     * 重新初始化工序跟踪记录（修复 scan_time/operator_name 为空的存量数据）
     *
     * 原因：旧版 batchInsert SQL 缺少 scan_time/operator_name 等字段，导致裁剪工序的
     * 扫码时间和操作人未写入 DB。此接口删除并重新生成所有订单的跟踪记录。
     *
     * 使用方法（修复所有订单）：
     * curl -X POST http://localhost:8088/api/internal/maintenance/reinit-process-tracking \
     *   -H "Authorization: Bearer {token}" \
     *   -H "Content-Type: application/json" \
     *   -d '{}'
     *
     * 使用方法（修复单个订单）：
     * curl -X POST http://localhost:8088/api/internal/maintenance/reinit-process-tracking \
     *   -H "Authorization: Bearer {token}" \
     *   -H "Content-Type: application/json" \
     *   -d '{"orderId": "xxx"}'
     *
     * ⚠️ 注意：仅重新初始化裁剪工序的扫码时间/操作人；其他工序的扫码记录（来自小程序扫码）将被保留。
     */
    @PostMapping("/reinit-process-tracking")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> reinitProcessTracking(@RequestBody(required = false) Map<String, Object> payload) {
        String orderId = payload != null ? (String) payload.get("orderId") : null;
        String orderNo = payload != null ? (String) payload.get("orderNo") : null;
        return internalMaintenanceOrchestrator.reinitProcessTracking(orderId, orderNo);
    }

    @PostMapping("/recalculate-sku-stock")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<?> recalculateSkuStock() {
        return internalMaintenanceOrchestrator.recalculateSkuStock();
    }
}
