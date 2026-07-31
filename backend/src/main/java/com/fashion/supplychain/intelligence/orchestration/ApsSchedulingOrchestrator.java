package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingRequest;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse.ScheduleSolution;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.system.entity.Factory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

/**
 * APS 高级排产约束求解编排器（纯 Java 贪心+约束检查，不依赖 OR-Tools）
 *
 * <p>算法流程：加载数据 → 按交期紧急度排序 → 贪心+约束检查分配工厂 → 生成甘特图+瓶颈标注</p>
 * <p>排产结果不持久化（仅返回前端展示，用户确认后走正常下单流程）</p>
 * <p>多租户隔离（P0铁律4）：所有查询带 tenant_id WHERE</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class ApsSchedulingOrchestrator {

    private final ApsSchedulingHelper helper;

    /**
     * 执行排产求解
     *
     * @param request 排产请求
     * @return 排产方案
     */
    public ApsSchedulingResponse solveScheduling(ApsSchedulingRequest request) {
        long startMs = System.currentTimeMillis();
        ApsSchedulingResponse response = new ApsSchedulingResponse();
        response.setStatus("FEASIBLE");

        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) {
                response.setStatus("INFEASIBLE");
                response.setSolutions(Collections.emptyList());
                response.setSolveTimeMs(System.currentTimeMillis() - startMs);
                return response;
            }

            LocalDate scheduleStart = helper.parseStartDate(request);
            boolean skipHolidays = request.getSkipHolidays() == null || request.getSkipHolidays();

            // 1. 加载数据
            List<ProductionOrder> orders = helper.loadOrders(request, tenantId);
            List<Factory> factories = helper.loadFactories(tenantId);
            Map<String, Map<String, ProcessCapacity>> capacityMap = helper.loadCapacityMap();
            Map<String, List<ProductionOrder>> completedByFactory = helper.loadCompletedOrdersByFactory(tenantId);
            Map<String, Integer> loadByFactory = helper.loadFactoryLoadMap(tenantId);

            if (orders.isEmpty() || factories.isEmpty()) {
                response.setStatus(orders.isEmpty() ? "INFEASIBLE" : "PARTIAL");
                response.setSolutions(Collections.emptyList());
                response.setSolveTimeMs(System.currentTimeMillis() - startMs);
                return response;
            }

            // 2. 按交期紧急度排序 + 3. 贪心分配
            List<ScheduleSolution> solutions = new ArrayList<>();
            Map<String, Integer> dynamicLoad = new HashMap<>(loadByFactory);
            for (ProductionOrder order : helper.sortOrdersByPriority(orders)) {
                ScheduleSolution solution = assignOrder(order, factories, capacityMap,
                        completedByFactory, dynamicLoad, scheduleStart, skipHolidays);
                if (solution != null) {
                    solutions.add(solution);
                    dynamicLoad.merge(solution.getFactoryName(),
                            order.getOrderQuantity() != null ? order.getOrderQuantity() : 0, Integer::sum);
                }
            }

            // 4. 输出方案
            response.setSolutions(solutions);
            response.setStatus(solutions.isEmpty() ? "INFEASIBLE"
                    : solutions.size() < orders.size() ? "PARTIAL" : "FEASIBLE");
            response.setSummary(helper.buildSummary(solutions));
            log.info("[APS排产] 租户={} 订单={} 方案={} 状态={} 耗时={}ms",
                    tenantId, orders.size(), solutions.size(), response.getStatus(),
                    System.currentTimeMillis() - startMs);
        } catch (Exception e) {
            log.error("[APS排产] 求解异常: {}", e.getMessage(), e);
            response.setStatus("INFEASIBLE");
            response.setSolutions(Collections.emptyList());
        }
        response.setSolveTimeMs(System.currentTimeMillis() - startMs);
        return response;
    }

    /** 分配单个订单到最优工厂（贪心：选评分最高的工厂） */
    private ScheduleSolution assignOrder(ProductionOrder order, List<Factory> factories,
                                         Map<String, Map<String, ProcessCapacity>> capacityMap,
                                         Map<String, List<ProductionOrder>> completedByFactory,
                                         Map<String, Integer> dynamicLoad,
                                         LocalDate scheduleStart, boolean skipHolidays) {
        Factory best = null;
        ApsSchedulingHelper.FactoryScore bestScore = null;
        for (Factory f : factories) {
            if (f.getFactoryName() == null) continue;
            Map<String, ProcessCapacity> cap = capacityMap.getOrDefault(f.getFactoryName(), Collections.emptyMap());
            int currentLoad = dynamicLoad.getOrDefault(f.getFactoryName(), 0);
            ApsSchedulingHelper.FactoryScore score = helper.scoreFactory(
                    order, f, cap, currentLoad,
                    completedByFactory.getOrDefault(f.getFactoryName(), Collections.emptyList()));
            if (bestScore == null || score.matchScore > bestScore.matchScore) {
                best = f;
                bestScore = score;
            }
        }
        if (best == null || bestScore == null) return null;
        return helper.buildSolution(order, best, bestScore, capacityMap, scheduleStart, skipHolidays);
    }
}
