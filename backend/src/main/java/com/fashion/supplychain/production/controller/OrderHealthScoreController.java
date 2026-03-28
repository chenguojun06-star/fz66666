package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 订单健康度评分 REST API 端点
 *
 * 功能说明：
 * - 单个/批量计算订单健康度评分
 * - 获取租户所有订单的评分排序
 * - 获取高风险订单列表
 *
 * @author AI Agent
 * @since 2026-03-22
 */
@Slf4j
@RestController
@RequestMapping("/api/production/orders/health-scores")
@PreAuthorize("isAuthenticated()")
public class OrderHealthScoreController {

    @Autowired
    private OrderHealthScoreOrchestrator orchestrator;

    /**
     * 批量计算订单健康度评分
     *
     * 示例请求：
     * POST /api/production/orders/health-scores/batch
     * {
     *   "orderIds": [1, 2, 3]
     * }
     *
     * 示例响应：
     * {
     *   "code": 200,
     *   "data": {
     *     "1": { "orderId": 1, "orderNo": "PO20260101001", "score": 75, "level": "good", "badge": null },
     *     "2": { "orderId": 2, "orderNo": "PO20260101002", "score": 62, "level": "warn", "badge": "注" }
     *   }
     * }
     */
    @PostMapping("/batch")
    public Result<Map<String, OrderHealthScoreDTO>> batchCalculateScores(
            @RequestBody List<String> orderIds) {
        try {
            // 直接调用 Orchestrator（现在期望 List<String>）
            Map<String, OrderHealthScoreDTO> scores = orchestrator.batchCalculateHealth(orderIds);
            return Result.success(scores);
        } catch (Exception e) {
            log.error("[OrderHealthScore] 批量计算失败", e);
            return Result.fail("批量计算订单健康度评分失败");
        }
    }

    /**
     * 获取租户所有订单的健康度评分（按风险等级排序）
     *
     * 示例请求：
     * GET /api/production/orders/health-scores/tenant
     *
     * 示例响应：
     * {
     *   "code": 200,
     *   "data": [
     *     { "orderId": 5, "score": 32, "level": "danger", "badge": "危" },
     *     { "orderId": 6, "score": 58, "level": "warn", "badge": "注" },
     *     { "orderId": 7, "score": 85, "level": "good", "badge": null }
     *   ]
     * }
     */
    @GetMapping("/tenant")
    public Result<List<OrderHealthScoreDTO>> getTenantHealthScores() {
        try {
            List<OrderHealthScoreDTO> scores = orchestrator.getTenantOrdersHealthScores();
            return Result.success(scores);
        } catch (Exception e) {
            log.error("[OrderHealthScore] 获取租户评分失败", e);
            return Result.fail("获取租户订单健康度评分失败");
        }
    }

    /**
     * 获取高风险订单列表（用于智能驾驶舱和预警）
     *
     * 示例请求：
     * GET /api/production/orders/health-scores/high-risk?limit=10
     *
     * 响应：评分 < 50 的订单列表（最多 10 条）
     */
    @GetMapping("/high-risk")
    public Result<List<OrderHealthScoreDTO>> getHighRiskOrders(
            @RequestParam(defaultValue = "10") int limit) {
        try {
            List<OrderHealthScoreDTO> risks = orchestrator.getHighRiskOrders(limit);
            return Result.success(risks);
        } catch (Exception e) {
            log.error("[OrderHealthScore] 获取高风险订单失败", e);
            return Result.fail("获取高风险订单失败");
        }
    }
}
