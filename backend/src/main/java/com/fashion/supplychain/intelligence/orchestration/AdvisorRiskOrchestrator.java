package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.RiskIndicator;
import com.fashion.supplychain.production.dto.response.OrderHealthScoreDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 超级顾问 — 风险量化编排器
 *
 * <p>职责：从真实数据库聚合订单风险指标（禁止 LLM 编造概率值）
 *
 * <ul>
 *   <li>逾期风险：deadline < today 且未完成</li>
 *   <li>高危风险：健康度 < 50 的订单数</li>
 *   <li>停滞风险：3天无扫码记录的活跃订单</li>
 * </ul>
 */
@Service
@Slf4j
public class AdvisorRiskOrchestrator {

    /** 与页面卡片一致的 5 种终态，排除后才是"活跃订单" */
    private static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderHealthScoreOrchestrator healthScoreOrchestrator;

    /**
     * 量化当前租户的全局风险指标列表（供 ECharts 可视化）。
     * 所有数字均来自数据库查询，不经过 LLM。
     */
    public List<RiskIndicator> quantifyRisks() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return List.of();

        List<RiskIndicator> risks = new ArrayList<>();
        try {
            risks.add(buildOverdueRisk(tenantId));
            risks.add(buildHealthRisk(tenantId));
            risks.add(buildStagnantRisk(tenantId));
        } catch (Exception e) {
            log.warn("[AdvisorRisk] 风险量化异常: {}", e.getMessage());
        }
        return risks;
    }

    /** 逾期订单风险 */
    private RiskIndicator buildOverdueRisk(Long tenantId) {
        long activeCount = countActiveOrders(tenantId);
        String factoryId = UserContext.factoryId();
        long overdueCount = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now()));
        double prob = activeCount > 0 ? Math.round(overdueCount * 100.0 / activeCount) / 100.0 : 0;
        return new RiskIndicator("逾期订单",
                Math.min(prob, 1.0),
                prob > 0.3 ? "high" : prob > 0.1 ? "medium" : "low",
                String.format("当前 %d 个活跃订单中有 %d 个已逾期", activeCount, overdueCount));
    }

    /** 健康度低于 50 的订单 */
    private RiskIndicator buildHealthRisk(Long tenantId) {
        String factoryId = UserContext.factoryId();
        List<ProductionOrder> active = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId)
                        .last("LIMIT 200"));
        if (active.isEmpty()) return new RiskIndicator("高危订单", 0, "low", "无活跃订单");

        List<String> ids = active.stream().map(o -> String.valueOf(o.getId())).collect(Collectors.toList());
        Collection<OrderHealthScoreDTO> scores = healthScoreOrchestrator.batchCalculateHealth(ids).values();
        long dangerCount = scores.stream()
                .filter(dto -> dto.getScore() < 50)
                .count();
        double prob = Math.round(dangerCount * 100.0 / active.size()) / 100.0;
        return new RiskIndicator("高危订单",
                Math.min(prob, 1.0),
                prob > 0.2 ? "high" : prob > 0.05 ? "medium" : "low",
                String.format("%d 个订单健康度 < 50（总 %d 个）", dangerCount, active.size()));
    }

    /** 停滞风险：3天无扫码 */
    private RiskIndicator buildStagnantRisk(Long tenantId) {
        long activeCount = countActiveOrders(tenantId);
        String factoryId = UserContext.factoryId();
        LocalDateTime threeDaysAgo = LocalDateTime.now().minusDays(3);
        long stagnant = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId)
                        .lt(ProductionOrder::getUpdateTime, threeDaysAgo));
        double prob = activeCount > 0 ? Math.round(stagnant * 100.0 / activeCount) / 100.0 : 0;
        return new RiskIndicator("停滞订单",
                Math.min(prob, 1.0),
                prob > 0.25 ? "high" : prob > 0.1 ? "medium" : "low",
                String.format("%d 个订单超过 3 天无扫码记录", stagnant));
    }

    private long countActiveOrders(Long tenantId) {
        String factoryId = UserContext.factoryId();
        return productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId));
    }
}
