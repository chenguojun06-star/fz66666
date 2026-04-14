package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.HyperAdvisorResponse.SimulationResult;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 超级顾问 — 轻量数字孪生模拟编排器
 *
 * <p>职责：基于真实订单数据做确定性 What-If 推演
 *
 * <ul>
 *   <li>场景 A — 延期交货：若交期推迟 N 天，影响哪些下游订单</li>
 *   <li>场景 B — 产能调拨：工厂 X 产能增加 N%，预期加快哪些订单</li>
 *   <li>场景 C — 追加订单：新增 N 件订单时，对现有排期的冲击</li>
 * </ul>
 *
 * <p>不依赖 LLM，全部确定性计算
 */
@Service
@Slf4j
public class AdvisorSimulationOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 运行延期交货场景模拟。
     *
     * @param delayDays 假设延期天数
     * @return 影响评估
     */
    public SimulationResult simulateDelay(int delayDays) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || delayDays <= 0) {
            return emptyResult("参数无效");
        }

        List<ProductionOrder> activeOrders = loadActiveOrders(tenantId);
        if (activeOrders.isEmpty()) return emptyResult("无活跃订单");

        LocalDate today = LocalDate.now();
        List<Map<String, Object>> rows = new ArrayList<>();
        int newOverdue = 0;

        for (ProductionOrder order : activeOrders) {
            LocalDate deadline = order.getPlannedEndDate() != null ? order.getPlannedEndDate().toLocalDate() : null;
            if (deadline == null) continue;

            int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
            // 模拟：若当前进度按日均推算完成日，加上延误后是否超期
            long daysRemaining = ChronoUnit.DAYS.between(today, deadline);
            long afterDelay = daysRemaining - delayDays;

            if (afterDelay < 0 && daysRemaining >= 0) {
                newOverdue++;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("订单号", order.getOrderNo());
                row.put("款名", order.getStyleName());
                row.put("原截止日", deadline.toString());
                row.put("当前进度", progress + "%");
                row.put("超期天数", Math.abs(afterDelay));
                row.put("影响", "将由准期变为逾期");
                rows.add(row);
            }
        }

        String recommendation = newOverdue == 0
                ? String.format("延期 %d 天后无新增逾期订单，风险可控", delayDays)
                : String.format("延期 %d 天将新增 %d 个逾期订单，建议优先协调产能", delayDays, newOverdue);
        return new SimulationResult(
                String.format("假设全线延期 %d 天", delayDays),
                rows, recommendation);
    }

    /**
     * 运行产能提升场景模拟。
     *
     * @param capacityBoostPercent 产能提升百分比（如 20 表示 +20%）
     * @return 预估加速效果
     */
    public SimulationResult simulateCapacityBoost(int capacityBoostPercent) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || capacityBoostPercent <= 0) {
            return emptyResult("参数无效");
        }

        List<ProductionOrder> activeOrders = loadActiveOrders(tenantId);
        if (activeOrders.isEmpty()) return emptyResult("无活跃订单");

        LocalDate today = LocalDate.now();
        List<Map<String, Object>> rows = new ArrayList<>();
        int benefited = 0;

        for (ProductionOrder order : activeOrders) {
            int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
            if (progress >= 90 || progress <= 0) continue;

            int remaining = 100 - progress;
            double speedup = 1.0 + capacityBoostPercent / 100.0;
            int daysToFinishNow = estimateDaysToFinish(order, today);
            int daysToFinishBoosted = (int) Math.ceil(daysToFinishNow / speedup);
            int savedDays = daysToFinishNow - daysToFinishBoosted;

            if (savedDays > 0) {
                benefited++;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("订单号", order.getOrderNo());
                row.put("款名", order.getStyleName());
                row.put("当前进度", progress + "%");
                row.put("预计节省天数", savedDays);
                row.put("影响", savedDays >= 3 ? "显著加速" : "小幅提升");
                rows.add(row);
                if (rows.size() >= 15) break;
            }
        }

        return new SimulationResult(
                String.format("假设产能提升 %d%%", capacityBoostPercent),
                rows,
                String.format("预计 %d 个订单受益，建议优先提升瓶颈工序产能", benefited));
    }

    private int estimateDaysToFinish(ProductionOrder order, LocalDate today) {
        LocalDate deadline = order.getPlannedEndDate() != null ? order.getPlannedEndDate().toLocalDate() : null;
        if (deadline == null || deadline.isBefore(today)) return 14;
        return Math.max(1, (int) ChronoUnit.DAYS.between(today, deadline));
    }

    private List<ProductionOrder> loadActiveOrders(Long tenantId) {
        return productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, List.of("completed", "cancelled", "scrapped", "archived", "closed"))
                        .last("LIMIT 100"));
    }

    private SimulationResult emptyResult(String reason) {
        return new SimulationResult(reason, List.of(), reason);
    }
}
