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
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 自动排产建议编排器 — 根据工厂真实历史数据建议排产方案
 *
 * <p>评分维度（满分 100）：
 * <ul>
 *   <li>产能分（40分）：可用产能 / 订单量，越充裕越高</li>
 *   <li>交期达成率分（30分）：历史已完成订单中 actualEndDate ≤ plannedEndDate 的比例（真实数据）</li>
 *   <li>品类匹配分（20分）：工厂历史完成订单中与本次品类相同的比例（真实数据）</li>
 *   <li>完成质量分（10分）：历史订单 completedQuantity/orderQuantity 均值（真实数据）</li>
 * </ul>
 * <p>无历史数据时，后三项分别给 18/12/6（各维度 60% 中等默认分），不再使用硬编码常量。
 */
@Service
@Slf4j
public class SchedulingSuggestionOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    /** 标准工序及时间占比 */
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

            // ① 获取所有工厂
            QueryWrapper<Factory> fqw = new QueryWrapper<>();
            fqw.eq(tenantId != null, "tenant_id", tenantId);
            List<Factory> factories = factoryService.list(fqw);
            if (factories.isEmpty()) {
                resp.setPlans(Collections.emptyList());
                return resp;
            }

            // ② 当前在制订单 → 工厂负载
            QueryWrapper<ProductionOrder> inProgressQw = new QueryWrapper<>();
            inProgressQw.eq(tenantId != null, "tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .in("status", "pending", "production", "delayed");
            List<ProductionOrder> inProgress = productionOrderService.list(inProgressQw);

            // ③ 历史已完成订单（有计划/实际结束时间）→ 真实交期达成率 + 品类匹配 + 完成质量
            QueryWrapper<ProductionOrder> doneQw = new QueryWrapper<>();
            doneQw.eq(tenantId != null, "tenant_id", tenantId)
                  .eq("delete_flag", 0)
                  .eq("status", "completed")
                  .isNotNull("factory_name")
                  .isNotNull("planned_end_date")
                  .isNotNull("actual_end_date");
            List<ProductionOrder> completed = productionOrderService.list(doneQw);

            // 按工厂名分组
            Map<String, Integer> loadByFactory = inProgress.stream()
                    .filter(o -> o.getFactoryName() != null)
                    .collect(Collectors.groupingBy(
                            ProductionOrder::getFactoryName,
                            Collectors.summingInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)));

            Map<String, List<ProductionOrder>> completedByFactory = completed.stream()
                    .filter(o -> o.getFactoryName() != null)
                    .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

            String requestedCategory = req.getProductCategory();
            int quantity = req.getQuantity() != null ? req.getQuantity() : 1000;

            // ④ 逐工厂计算方案
            List<SchedulePlan> plans = new ArrayList<>();
            for (Factory f : factories) {
                String factoryName = f.getFactoryName();
                if (factoryName == null) continue;

                int currentLoad = loadByFactory.getOrDefault(factoryName, 0);
                int dailyCapacity = (f.getDailyCapacity() != null && f.getDailyCapacity() > 0)
                        ? f.getDailyCapacity() : 500;
                int availableCapacity = Math.max(0, dailyCapacity * 30 - currentLoad);
                int estimatedDays = Math.max(7, (int) Math.ceil((double) quantity / dailyCapacity));

                // ── 产能分（40分）──────────────────────────────────────────
                double capacityRatio = availableCapacity > 0
                        ? Math.min(1.0, (double) availableCapacity / quantity) : 0;
                int capacityScore = (int) (capacityRatio * 40);

                // ── 历史交期达成率分（30分）—— 真实数据 ────────────────────
                List<ProductionOrder> factoryDone = completedByFactory.getOrDefault(factoryName, Collections.emptyList());
                int onTimeScore;
                if (factoryDone.isEmpty()) {
                    onTimeScore = 18; // 无历史数据给中等分（60%×30）
                } else {
                    long onTimeCount = factoryDone.stream()
                            .filter(o -> o.getActualEndDate() != null && o.getPlannedEndDate() != null
                                    && !o.getActualEndDate().isAfter(o.getPlannedEndDate()))
                            .count();
                    double onTimeRate = (double) onTimeCount / factoryDone.size();
                    onTimeScore = (int) (onTimeRate * 30);
                    log.debug("[排产建议] 工厂={} 交期达成率={}/{} ({}%) 得分={}",
                            factoryName, onTimeCount, factoryDone.size(),
                            String.format("%.0f", onTimeRate * 100), onTimeScore);
                }

                // ── 品类匹配分（20分）—— 真实数据 ──────────────────────────
                int categoryScore;
                if (factoryDone.isEmpty() || requestedCategory == null || requestedCategory.isBlank()) {
                    categoryScore = 12; // 无数据给中等分（60%×20）
                } else {
                    long matchCount = factoryDone.stream()
                            .filter(o -> requestedCategory.equals(o.getProductCategory()))
                            .count();
                    double matchRate = (double) matchCount / factoryDone.size();
                    categoryScore = (int) (matchRate * 20);
                }

                // ── 完成质量分（10分）—— 真实数据 ──────────────────────────
                int qualityScore;
                if (factoryDone.isEmpty()) {
                    qualityScore = 6; // 无数据给中等分（60%×10）
                } else {
                    OptionalDouble avgOpt = factoryDone.stream()
                            .filter(o -> o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                                    && o.getCompletedQuantity() != null)
                            .mapToDouble(o -> Math.min(1.0, (double) o.getCompletedQuantity() / o.getOrderQuantity()))
                            .average();
                    qualityScore = avgOpt.isPresent() ? (int) (avgOpt.getAsDouble() * 10) : 6;
                }

                int matchScore = Math.min(100, capacityScore + onTimeScore + categoryScore + qualityScore);

                // ── 建议开始时间：依据客观负载率动态延迟 ──────────────────
                double loadRatio = dailyCapacity > 0 ? (double) currentLoad / (dailyCapacity * 30) : 0;
                int startDelayDays = loadRatio < 0.5 ? 1 : (loadRatio < 0.8 ? 3 : 7);
                LocalDate suggestedStart = LocalDate.now().plusDays(startDelayDays);
                LocalDate estimatedEnd = suggestedStart.plusDays(estimatedDays);

                SchedulePlan plan = new SchedulePlan();
                plan.setFactoryName(factoryName);
                plan.setMatchScore(matchScore);
                plan.setCurrentLoad(currentLoad);
                plan.setAvailableCapacity(availableCapacity);
                plan.setSuggestedStart(suggestedStart.toString());
                plan.setEstimatedEnd(estimatedEnd.toString());
                plan.setEstimatedDays(estimatedDays);
                plan.setGanttItems(buildGantt(suggestedStart, estimatedDays));
                plans.add(plan);
            }

            // 按匹配分倒序，取前5
            plans.sort(Comparator.comparingInt(SchedulePlan::getMatchScore).reversed());
            resp.setPlans(plans.size() > 5 ? plans.subList(0, 5) : plans);

            log.info("[排产建议] 租户={} 款式={} 数量={} 品类={} 历史完成订单数={} 推荐{}个方案",
                    tenantId, req.getStyleNo(), quantity, requestedCategory, completed.size(), resp.getPlans().size());
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
