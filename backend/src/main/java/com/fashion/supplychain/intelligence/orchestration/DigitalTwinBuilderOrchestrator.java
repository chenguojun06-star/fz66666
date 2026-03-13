package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
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
 * 数字孪生构建器 — 在 Graph 执行前为 AgentState 构建订单聚合快照。
 * 快照数据供所有 Specialist Agent 和 Reflection Engine 使用，避免各节点重复查库。
 */
@Slf4j
@Service
public class DigitalTwinBuilderOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderHealthScoreOrchestrator healthScoreOrchestrator;

    /**
     * 为 AgentState 构建数字孪生快照。
     */
    public AgentState buildSnapshot(AgentState state) {
        Long tenantId = state.getTenantId();
        List<String> orderIds = state.getOrderIds();

        List<ProductionOrder> orders = queryOrders(tenantId, orderIds);
        if (orders.isEmpty()) {
            state.setDigitalTwinSnapshot("{\"orders\":0}");
            return state;
        }

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("totalOrders", orders.size());
        snapshot.put("snapshotDate", LocalDate.now().toString());

        // 进度分布
        long completed = orders.stream().filter(o -> "COMPLETED".equals(o.getStatus())).count();
        long inProgress = orders.stream().filter(o -> "IN_PROGRESS".equals(o.getStatus())).count();
        snapshot.put("completed", completed);
        snapshot.put("inProgress", inProgress);
        snapshot.put("other", orders.size() - completed - inProgress);

        // 交期分布
        long overdue = orders.stream()
                .filter(o -> o.getExpectedShipDate() != null && o.getExpectedShipDate().isBefore(LocalDate.now()))
                .count();
        long urgent7d = orders.stream()
                .filter(o -> o.getExpectedShipDate() != null)
                .filter(o -> { long d = ChronoUnit.DAYS.between(LocalDate.now(), o.getExpectedShipDate()); return d >= 0 && d <= 7; })
                .count();
        snapshot.put("overdue", overdue);
        snapshot.put("urgent7d", urgent7d);

        // 平均进度
        double avgProgress = orders.stream()
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average().orElse(0);
        snapshot.put("avgProgress", Math.round(avgProgress));

        // 健康分布
        try {
            List<String> ids = orders.stream().map(o -> String.valueOf(o.getId())).toList();
            List<Map<String, Object>> scores = healthScoreOrchestrator.batchScores(ids);
            long critical = scores.stream().filter(m -> (int) m.getOrDefault("score", 50) < 50).count();
            long warning = scores.stream().filter(m -> { int s = (int) m.getOrDefault("score", 50); return s >= 50 && s < 75; }).count();
            snapshot.put("healthCritical", critical);
            snapshot.put("healthWarning", warning);
            snapshot.put("healthGood", scores.size() - critical - warning);
        } catch (Exception e) {
            log.debug("[DigitalTwin] 健康分获取失败: {}", e.getMessage());
        }

        try {
            state.setDigitalTwinSnapshot(JSON.writeValueAsString(snapshot));
        } catch (Exception e) {
            state.setDigitalTwinSnapshot("{}");
        }

        state.getNodeTrace().add("digital_twin");
        log.info("[DigitalTwin] 租户={} 快照订单数={}", tenantId, orders.size());
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
