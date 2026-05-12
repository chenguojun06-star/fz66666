package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 货期风险专家代理 — 查询真实订单进度 + 货期数据，输出数据驱动的风险评估。
 */
@Slf4j
@Service
public class DeliverySpecialistAgent implements SpecialistAgent {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderHealthScoreOrchestrator healthScoreOrchestrator;

    @Override
    public String getRoute() { return "delivery_risk"; }

    @Override
    public AgentState analyze(AgentState state) {
        Long tenantId = state.getTenantId();
        List<String> orderIds = state.getOrderIds();

        List<ProductionOrder> orders = queryOrders(tenantId, orderIds);
        if (orders.isEmpty()) {
            state.setContextSummary("未找到进行中的订单数据，无法进行货期分析。");
            state.setProgressRate(0);
            state.setRiskScore(30);
            return state;
        }

        // 计算真实指标
        double avgProgress = orders.stream()
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average().orElse(0);

        long overdueCount = orders.stream()
                .filter(o -> o.getExpectedShipDate() != null && o.getExpectedShipDate().toLocalDate().isBefore(LocalDate.now()))
                .count();

        long urgentCount = orders.stream()
                .filter(o -> {
                    if (o.getExpectedShipDate() == null) return false;
                    long days = ChronoUnit.DAYS.between(LocalDate.now(), o.getExpectedShipDate().toLocalDate());
                    return days >= 0 && days <= 7;
                }).count();

        // 取健康分
        Collection<OrderHealthScoreDTO> scores = healthScoreOrchestrator.batchCalculateHealth(
                orderIds != null && !orderIds.isEmpty() ? orderIds :
                orders.stream().map(o -> String.valueOf(o.getId())).toList()).values();

        double avgScore = scores.stream()
                .mapToInt(OrderHealthScoreDTO::getScore)
                .filter(s -> s >= 0)
                .average().orElse(50);

        // 写入 State
        state.setProgressRate(avgProgress);
        state.setRiskScore(100 - avgScore); // 风险=100-健康
        state.setContextSummary(String.format(
                "【货期分析】%d个订单，平均进度%.0f%%，逾期%d个，7天内到期%d个，平均健康%.0f分。%s",
                orders.size(), avgProgress, overdueCount, urgentCount, avgScore,
                overdueCount > 0 ? "⚠️建议优先处理逾期订单。" : "整体货期可控。"));

        log.info("[DeliverySpecialist] 租户={} 订单数={} 平均进度={} 逾期={}", tenantId, orders.size(), avgProgress, overdueCount);
        return state;
    }

    private List<ProductionOrder> queryOrders(Long tenantId, List<String> orderIds) {
        if (orderIds != null && !orderIds.isEmpty()) {
            return productionOrderService.lambdaQuery()
                    .in(ProductionOrder::getId, orderIds)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .list();
        }
        return productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .ne(ProductionOrder::getStatus, "COMPLETED")
                .last("LIMIT 100")
                .list();
    }
}
