package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 订单健康度评分编排器（纯计算，无 DB 写操作）
 *
 * 三维度加权（总 100 分）：
 *   - 生产进度      40 分：productionProgress × 0.40
 *   - 交期健康      35 分：按剩余天数分档
 *   - 物料采购完成  25 分：procurementCompletionRate × 0.25
 *
 * 分档：≥75 good（绿）/ 50-74 warn（橙）/ <50 danger（红）
 */
@Slf4j
@Service
public class OrderHealthScoreOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    // ─────────────────────────────────────────────────────────────────────
    // 公开接口
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 批量计算订单健康分（接收 String 类型订单 ID，返回 DTO 对象）
     */
    public Map<String, OrderHealthScoreDTO> batchCalculateHealth(List<String> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Collections.emptyMap();
        }

        final Long tenantId = UserContext.tenantId();

        // 将 String ID 转换为查询参数（productionOrder 的 id 字段是 String）
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        Map<String, OrderHealthScoreDTO> resultMap = new HashMap<>(orders.size());
        for (ProductionOrder productionOrder : orders) {
            if (productionOrder != null) {
                String orderId = productionOrder.getId();
                OrderHealthScoreDTO dto = calculateScoreDTO(productionOrder);
                resultMap.put(orderId, dto);
            }
        }

        return resultMap;
    }

    /**
     * 获取租户所有订单的健康度评分（按风险排序）
     */
    public List<OrderHealthScoreDTO> getTenantOrdersHealthScores() {
        Long tenantId = UserContext.tenantId();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByAsc(ProductionOrder::getId)
                .last("LIMIT 5000")
                .list();

        return orders.stream()
                .map(this::calculateScoreDTO)
                .sorted(Comparator.comparingInt(OrderHealthScoreDTO::getScore))
                .collect(Collectors.toList());
    }

    public List<OrderHealthScoreDTO> getHighRiskOrders(int limit) {
        Long tenantId = UserContext.tenantId();
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .orderByAsc(ProductionOrder::getId)
                .last("LIMIT " + (limit > 0 ? limit : 100))
                .list();

        return orders.stream()
                .map(this::calculateScoreDTO)
                .filter(dto -> dto.getScore() < 50)
                .sorted(Comparator.comparingInt(OrderHealthScoreDTO::getScore))
                .limit(limit > 0 ? limit : 10)
                .collect(Collectors.toList());
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有方法
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 将订单转换为评分 DTO
     */
    private OrderHealthScoreDTO calculateScoreDTO(ProductionOrder order) {
        int score = calcScore(order);
        String level = scoreToLevel(score);
        String badge = calculateBadge(score);

        OrderHealthScoreDTO dto = new OrderHealthScoreDTO();
        dto.setOrderId(order.getId());
        dto.setOrderNo(order.getOrderNo());
        dto.setScore(score);
        dto.setLevel(level);
        dto.setBadge(badge);
        dto.setProgressScore(calculateProgressScore(order));
        dto.setDeadlineScore(calculateDeadlineScore(order));
        dto.setProcurementScore(calculateProcurementScore(order));
        return dto;
    }

    /**
     * 计算总分
     */
    public int calcScore(ProductionOrder order) {
        int score = 0;

        // 进度：40分
        score += calculateProgressScore(order);

        // 交期：35分
        score += calculateDeadlineScore(order);

        // 采购：25分
        score += calculateProcurementScore(order);

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 生产进度评分（40分）
     */
    private int calculateProgressScore(ProductionOrder order) {
        Integer progress = order.getProductionProgress();
        if (progress == null) progress = 0;
        return Math.round(progress * 0.40f);
    }

    /**
     * 交期评分（35分）
     */
    private int calculateDeadlineScore(ProductionOrder order) {
        if (order.getExpectedShipDate() == null) {
            return 20;  // 无交期：20分
        }

        long daysRemaining = ChronoUnit.DAYS.between(LocalDate.now(), order.getExpectedShipDate());

        if (daysRemaining > 14) return 35;
        if (daysRemaining > 7)  return 26;
        if (daysRemaining > 3)  return 16;
        if (daysRemaining > 0)  return 8;
        return 0;  // 已逾期：0分
    }

    /**
     * 采购完成评分（25分）
     */
    private int calculateProcurementScore(ProductionOrder order) {
        Integer procRate = order.getProcurementCompletionRate();
        if (procRate == null) {
            return 18;  // 无数据：18分
        }
        return Math.round(procRate * 0.25f);
    }

    /**
     * 分数到风险等级
     */
    public String scoreToLevel(int score) {
        if (score >= 75) return "NORMAL";
        if (score >= 50) return "WARNING";
        return "CRITICAL";
    }

    /**
     * 计算徽章
     */
    private String calculateBadge(int score) {
        if (score >= 75) return null;
        if (score >= 50) return "注";
        return "危";
    }
}
