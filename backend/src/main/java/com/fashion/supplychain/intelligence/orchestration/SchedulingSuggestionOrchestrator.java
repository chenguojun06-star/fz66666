package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionRequest;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.GanttItem;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.SchedulePlan;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 自动排产建议编排器 — 根据工厂产能与负载建议排产方案
 *
 * <p>算法：
 * <ol>
 *   <li>获取所有工厂</li>
 *   <li>计算每个工厂当前在产订单总量（currentLoad）</li>
 *   <li>估算可用产能 = 工厂额定产能 − 当前负载</li>
 *   <li>匹配分数 = 可用产能占比 × 40 + 历史交期达成率 × 30 + 地理匹配 × 30</li>
 *   <li>生成甘特图时间线（采购→裁剪→车缝→尾部→质检→入库）</li>
 * </ol>
 */
@Service
@Slf4j
public class SchedulingSuggestionOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /** 默认标准工序及占比 */
    private static final LinkedHashMap<String, Double> STAGE_RATIO = new LinkedHashMap<>() {{
        put("采购", 0.10);
        put("裁剪", 0.15);
        put("车缝", 0.40);
        put("尾部", 0.15);
        put("质检", 0.10);
        put("入库", 0.10);
    }};

    public SchedulingSuggestionResponse suggest(SchedulingSuggestionRequest req) {
        SchedulingSuggestionResponse resp = new SchedulingSuggestionResponse();
        try {
        Long tenantId = UserContext.tenantId();

        // 获取所有工厂
        QueryWrapper<Factory> fqw = new QueryWrapper<>();
        fqw.eq(tenantId != null, "tenant_id", tenantId);
        List<Factory> factories = factoryService.list(fqw);

        if (factories.isEmpty()) {
            resp.setPlans(Collections.emptyList());
            return resp;
        }

        // 获取进行中订单（用于计算各工厂负载）
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq(tenantId != null, "tenant_id", tenantId)
           .eq("delete_flag", 0)
           .eq("status", "IN_PROGRESS");
        List<ProductionOrder> inProgress = productionOrderService.list(oqw);

        // 按工厂名分组统计负载
        Map<String, Integer> loadByFactory = inProgress.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(
                        ProductionOrder::getFactoryName,
                        Collectors.summingInt(o ->
                                o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)));

        // 为每个工厂计算排产方案
        List<SchedulePlan> plans = new ArrayList<>();
        for (Factory f : factories) {
            String factoryName = f.getFactoryName();
            if (factoryName == null) continue;

            int currentLoad = loadByFactory.getOrDefault(factoryName, 0);
            // 从工厂记录读取日产能，未配置时默认 500
            int dailyCapacity = (f.getDailyCapacity() != null && f.getDailyCapacity() > 0)
                    ? f.getDailyCapacity() : 500;
            int availableCapacity = Math.max(0, dailyCapacity * 30 - currentLoad);

            // 估算生产天数
            int quantity = req.getQuantity() != null ? req.getQuantity() : 1000;
            int estimatedDays = Math.max(7, (int) Math.ceil((double) quantity / dailyCapacity));

            // 匹配分数
            double capacityRatio = availableCapacity > 0
                    ? Math.min(1.0, (double) availableCapacity / quantity) : 0;
            int matchScore = (int) (capacityRatio * 40 + 70 * 0.30 + 50 * 0.30);
            // 70 和 50 分别是历史达成率和地理匹配的默认估分

            LocalDate suggestedStart = LocalDate.now().plusDays(2);
            LocalDate estimatedEnd = suggestedStart.plusDays(estimatedDays);

            // 甘特图
            List<GanttItem> gantt = buildGantt(suggestedStart, estimatedDays);

            SchedulePlan plan = new SchedulePlan();
            plan.setFactoryName(factoryName);
            plan.setMatchScore(matchScore);
            plan.setCurrentLoad(currentLoad);
            plan.setAvailableCapacity(availableCapacity);
            plan.setSuggestedStart(suggestedStart.toString());
            plan.setEstimatedEnd(estimatedEnd.toString());
            plan.setEstimatedDays(estimatedDays);
            plan.setGanttItems(gantt);
            plans.add(plan);
        }

        // 按匹配分倒序
        plans.sort(Comparator.comparingInt(SchedulePlan::getMatchScore).reversed());
        // 取前5
        resp.setPlans(plans.size() > 5 ? plans.subList(0, 5) : plans);
        } catch (Exception e) {
            log.error("[排产建议] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private List<GanttItem> buildGantt(LocalDate start, int totalDays) {
        List<GanttItem> items = new ArrayList<>();
        LocalDate cursor = start;
        for (Map.Entry<String, Double> entry : STAGE_RATIO.entrySet()) {
            int days = Math.max(1, (int) Math.round(totalDays * entry.getValue()));
            GanttItem g = new GanttItem();
            g.setStage(entry.getKey());
            g.setStartDate(cursor.toString());
            g.setEndDate(cursor.plusDays(days).toString());
            g.setDays(days);
            items.add(g);
            cursor = cursor.plusDays(days);
        }
        return items;
    }
}
