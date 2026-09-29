package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 内部维护工具编排器 —— 仅用于数据修复。
 *
 * <p>D-636：原逻辑位于 {@code InternalMaintenanceController}。该 Controller 直接注入
 * ProductionOrderService 并在最外层做「订单解析 + 批量遍历 + 逐单 try/catch 计数 +
 * 调用两个 Orchestrator」，属跨服务编排泄漏到最外层。现整体下沉到本类，
 * Controller 只保留端点声明与请求参数拆包。
 *
 * <p>⚠️ 这些操作会遍历/改写大量存量数据：
 * <ol>
 *   <li>仅供管理员（ROLE_SUPER_ADMIN）使用</li>
 *   <li>生产环境使用前请备份数据</li>
 *   <li>完成数据修复后建议删除或禁用对应端点</li>
 * </ol>
 */
@Service
@Slf4j
public class InternalMaintenanceOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private ProductSkuOrchestrator productSkuOrchestrator;

    /**
     * 批量同步所有订单的工序单价。
     *
     * <p>⚠️ 会遍历所有订单，可能耗时较长；建议在业务低峰期执行，执行前请备份数据库。
     */
    public Result<Map<String, Object>> syncAllUnitPrices() {
        log.warn("开始批量同步工序单价（管理员维护操作）");

        try {
            // 查询所有有效订单
            List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .isNotNull(ProductionOrder::getProgressWorkflowJson)
                    .ne(ProductionOrder::getProgressWorkflowJson, "")
                    .last("LIMIT 5000")
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
     * 同步单个订单的工序单价。
     *
     * <p>可传 orderId，也可只传 orderNo（本方法会先按 orderNo 反查 orderId）。
     *
     * @param orderId 订单 ID（可为空，此时用 orderNo 反查）
     * @param orderNo 订单号（可为空）
     */
    public Result<String> syncUnitPrices(String orderId, String orderNo) {
        // 根据 orderNo 查询 orderId
        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .eq(ProductionOrder::getDeleteFlag, 0)
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
     * 批量刷新所有订单的 progressWorkflowJson 中的工序单价。
     * 从模板库读取最新单价，更新到订单的 progressWorkflowJson 字段。
     *
     * <p>⚠️ 仅更新非已完成的订单。
     */
    public Result<Map<String, Object>> refreshWorkflowPrices() {
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
     * 批量同步工序跟踪表 (t_production_process_tracking) 中的单价。
     * 从模板库读取最新单价，更新到跟踪记录的 unit_price 字段，同时重新计算已扫码记录的结算金额。
     */
    public Result<Map<String, Object>> refreshTrackingPrices() {
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
     * 重新初始化工序跟踪记录（修复 scan_time/operator_name 为空的存量数据）。
     *
     * <p>原因：旧版 batchInsert SQL 缺少 scan_time/operator_name 等字段，导致裁剪工序的
     * 扫码时间和操作人未写入 DB。此操作删除并重新生成对应订单的跟踪记录。
     *
     * <p>⚠️ 仅重新初始化裁剪工序的扫码时间/操作人；其他工序的扫码记录（来自小程序扫码）将被保留。
     *
     * @param orderId 订单 ID；与 orderNo 都为空时走批量模式（处理所有订单）
     * @param orderNo 订单号（可为空）
     */
    public Result<?> reinitProcessTracking(String orderId, String orderNo) {
        log.warn("开始重新初始化工序跟踪记录（管理员维护操作）orderId={}, orderNo={}", orderId, orderNo);

        // 单订单模式
        if (StringUtils.hasText(orderId) || StringUtils.hasText(orderNo)) {
            if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
                ProductionOrder o = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getOrderNo, orderNo.trim())
                        .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                        .eq(ProductionOrder::getDeleteFlag, 0)
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
                    .last("LIMIT 5000")
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

    /** 重新计算 SKU 库存（修复双重更新 bug） */
    public Result<Map<String, Object>> recalculateSkuStock() {
        log.warn("开始重新计算SKU库存（管理员维护操作 - 修复双重更新bug）");
        try {
            Map<String, Object> result = productSkuOrchestrator.recalculateSkuStock();
            return Result.success(result);
        } catch (Exception e) {
            log.error("SKU库存重新计算失败", e);
            return Result.fail("SKU库存重新计算失败：" + e.getMessage());
        }
    }
}
