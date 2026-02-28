package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 内部维护工具Controller - 仅用于数据修复
 * ⚠️ 警告：
 * 1. 此Controller仅供管理员使用
 * 2. 生产环境使用前请备份数据
 * 3. 完成数据修复后建议删除或禁用此Controller
 */
@RestController
@RequestMapping("/api/internal/maintenance")
@PreAuthorize("isAuthenticated()")
public class InternalMaintenanceController {

    private static final Logger log = LoggerFactory.getLogger(InternalMaintenanceController.class);

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

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
        log.warn("开始批量同步工序单价（管理员维护操作）");

        try {
            // 查询所有有效订单
            List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .isNotNull(ProductionOrder::getProgressWorkflowJson)
                    .ne(ProductionOrder::getProgressWorkflowJson, "")
                    .list();

            if (orders.isEmpty()) {
                return Result.fail("未找到需要同步的订单");
            }

            int totalOrders = orders.size();
            int successCount = 0;
            int skipCount = 0;
            int errorCount = 0;
            int totalSynced = 0;

            List<Map<String, Object>> details = new ArrayList<>();

            // 逐个订单同步
            for (ProductionOrder order : orders) {
                try {
                    int synced = processTrackingOrchestrator.syncUnitPrices(order.getId());

                    if (synced > 0) {
                        successCount++;
                        totalSynced += synced;

                        Map<String, Object> detail = new HashMap<>();
                        detail.put("orderNo", order.getOrderNo());
                        detail.put("orderId", order.getId());
                        detail.put("syncedRecords", synced);
                        detail.put("status", "success");
                        details.add(detail);

                        log.info("订单 {} 同步成功，更新了 {} 条工序跟踪记录", order.getOrderNo(), synced);
                    } else {
                        skipCount++;
                        log.debug("订单 {} 无需同步（单价已一致）", order.getOrderNo());
                    }

                } catch (Exception e) {
                    errorCount++;

                    Map<String, Object> detail = new HashMap<>();
                    detail.put("orderNo", order.getOrderNo());
                    detail.put("orderId", order.getId());
                    detail.put("error", e.getMessage());
                    detail.put("status", "error");
                    details.add(detail);

                    log.error("订单 {} 同步失败: {}", order.getOrderNo(), e.getMessage(), e);
                }
            }

            // 汇总结果
            Map<String, Object> summary = new HashMap<>();
            summary.put("totalOrders", totalOrders);
            summary.put("successCount", successCount);
            summary.put("skipCount", skipCount);
            summary.put("errorCount", errorCount);
            summary.put("totalSyncedRecords", totalSynced);
            summary.put("details", details);

            log.warn("批量同步完成 - 总订单: {}, 成功: {}, 跳过: {}, 失败: {}, 同步记录: {}",
                    totalOrders, successCount, skipCount, errorCount, totalSynced);

            return Result.success(summary);

        } catch (Exception e) {
            log.error("批量同步工序单价失败", e);
            return Result.fail("批量同步失败: " + e.getMessage());
        }
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

        // 根据 orderNo 查询 orderId
        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .last("LIMIT 1")
                    .one();

            if (order != null) {
                orderId = order.getId();
            }
        }

        if (!StringUtils.hasText(orderId)) {
            return Result.fail("参数错误：缺少 orderId 或 orderNo");
        }

        try {
            int synced = processTrackingOrchestrator.syncUnitPrices(orderId);

            if (synced > 0) {
                log.info("订单 {} 同步成功，更新了 {} 条工序跟踪记录", orderNo != null ? orderNo : orderId, synced);
                return Result.success("同步成功，更新了 " + synced + " 条工序跟踪记录");
            } else {
                return Result.success("无需同步，单价已一致");
            }

        } catch (Exception e) {
            log.error("订单 {} 同步失败", orderNo != null ? orderNo : orderId, e);
            return Result.fail("同步失败: " + e.getMessage());
        }
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
        log.warn("开始批量刷新订单工序单价（管理员维护操作）");
        try {
            Map<String, Object> summary = processTrackingOrchestrator.refreshWorkflowPrices();
            return Result.success(summary);
        } catch (Exception e) {
            log.error("批量刷新工序单价失败", e);
            return Result.fail("批量刷新失败: " + e.getMessage());
        }
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
        log.info("检查工序单价一致性（管理员维护操作）");
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
        log.warn("开始批量刷新工序跟踪表单价（管理员维护操作）");
        try {
            Map<String, Object> summary = processTrackingOrchestrator.syncAllOrderTrackingPrices();
            return Result.success(summary);
        } catch (Exception e) {
            log.error("批量刷新工序跟踪单价失败", e);
            return Result.fail("刷新失败: " + e.getMessage());
        }
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
    @PreAuthorize("true")
    public Result<?> reinitProcessTracking(@RequestBody(required = false) Map<String, Object> payload) {
        String orderId = payload != null ? (String) payload.get("orderId") : null;
        String orderNo = payload != null ? (String) payload.get("orderNo") : null;

        log.warn("开始重新初始化工序跟踪记录（管理员维护操作）orderId={}, orderNo={}", orderId, orderNo);

        // 单订单模式
        if (StringUtils.hasText(orderId) || StringUtils.hasText(orderNo)) {
            if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
                ProductionOrder o = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getOrderNo, orderNo.trim())
                        .last("LIMIT 1").one();
                if (o != null) orderId = o.getId();
            }
            if (!StringUtils.hasText(orderId)) {
                return Result.fail("未找到订单：" + orderNo);
            }
            try {
                int count = processTrackingOrchestrator.initializeProcessTracking(orderId);
                return Result.success("重新初始化完成，生成 " + count + " 条跟踪记录");
            } catch (Exception e) {
                log.error("重新初始化失败: orderId={}", orderId, e);
                return Result.fail("重新初始化失败：" + e.getMessage());
            }
        }

        // 批量模式：处理所有有菲号的订单
        try {
            List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .list();

            int successCount = 0, errorCount = 0, totalRecords = 0;
            for (ProductionOrder order : orders) {
                try {
                    int count = processTrackingOrchestrator.initializeProcessTracking(order.getId());
                    totalRecords += count;
                    successCount++;
                } catch (Exception e) {
                    errorCount++;
                    log.warn("订单 {} 重新初始化失败: {}", order.getOrderNo(), e.getMessage());
                }
            }

            Map<String, Object> result = new HashMap<>();
            result.put("totalOrders", orders.size());
            result.put("successCount", successCount);
            result.put("errorCount", errorCount);
            result.put("totalTrackingRecords", totalRecords);
            log.warn("工序跟踪重新初始化完成：{} 个订单，生成 {} 条记录，失败 {} 个", successCount, totalRecords, errorCount);
            return Result.success(result);
        } catch (Exception e) {
            log.error("批量重新初始化失败", e);
            return Result.fail("批量初始化失败：" + e.getMessage());
        }
    }
}

