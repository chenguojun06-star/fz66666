package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionRequest;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.GanttItem;
import com.fashion.supplychain.intelligence.dto.SchedulingSuggestionResponse.SchedulePlan;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

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
@Lazy
@Slf4j
public class SchedulingSuggestionOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired(required = false)
    private OptimizationSolverOrchestrator optimizationSolverOrchestrator;

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
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) {
                resp.setPlans(Collections.emptyList());
                return resp;
            }

            List<Factory> factories = listFactories(tenantId);
            if (factories.isEmpty()) {
                resp.setPlans(Collections.emptyList());
                return resp;
            }

            Map<String, Integer> loadByFactory = loadFactoryLoadMap(tenantId);
            Map<String, List<ProductionOrder>> completedByFactory = loadCompletedOrdersByFactory(tenantId);
            Map<String, Integer> realDailyCapByFactory = computeRealDailyCapacity(tenantId);

            String requestedCategory = req.getProductCategory();
            int quantity = req.getQuantity() != null ? req.getQuantity() : 1000;

            List<SchedulePlan> plans = factories.stream()
                    .filter(f -> f.getFactoryName() != null)
                    .map(f -> buildPlanForFactory(f, loadByFactory, completedByFactory,
                            realDailyCapByFactory, requestedCategory, quantity))
                    .collect(Collectors.toList());

            plans.sort(Comparator.comparingInt(SchedulePlan::getMatchScore).reversed());
            resp.setPlans(plans.size() > 5 ? plans.subList(0, 5) : plans);

            enhanceWithOptimization(resp, req, quantity, requestedCategory);

            log.info("[排产建议] 租户={} 款式={} 数量={} 品类={} 推荐{}个方案",
                    tenantId, req.getStyleNo(), quantity, requestedCategory, resp.getPlans().size());
        } catch (Exception e) {
            log.error("[排产建议] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private List<Factory> listFactories(Long tenantId) {
        QueryWrapper<Factory> fqw = new QueryWrapper<>();
        fqw.eq("tenant_id", tenantId).eq("delete_flag", 0);
        return factoryService.list(fqw);
    }

    private Map<String, Integer> loadFactoryLoadMap(Long tenantId) {
        QueryWrapper<ProductionOrder> inProgressQw = new QueryWrapper<>();
        inProgressQw.eq("tenant_id", tenantId)
                    .eq("delete_flag", 0)
                    .in("status", "pending", "production", "delayed");
        List<ProductionOrder> inProgress = productionOrderService.list(inProgressQw);
        return inProgress.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(
                        ProductionOrder::getFactoryName,
                        Collectors.summingInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)));
    }

    private Map<String, List<ProductionOrder>> loadCompletedOrdersByFactory(Long tenantId) {
        QueryWrapper<ProductionOrder> doneQw = new QueryWrapper<>();
        doneQw.eq("tenant_id", tenantId)
              .eq("delete_flag", 0)
              .eq("status", "completed")
              .isNotNull("factory_name")
              .isNotNull("planned_end_date")
              .isNotNull("actual_end_date");
        List<ProductionOrder> completed = productionOrderService.list(doneQw);
        return completed.stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));
    }

    private Map<String, Integer> computeRealDailyCapacity(Long tenantId) {
        Map<String, String> orderToFactory = loadOrderToFactoryMap(tenantId);
        QueryWrapper<ScanRecord> scanQw = new QueryWrapper<>();
        scanQw.eq("tenant_id", tenantId)
              .eq("scan_result", "success")
              .eq("scan_type", "production")
              .ge("scan_time", LocalDateTime.now().minusDays(30))
              .isNotNull("order_id");
        List<ScanRecord> recentScans = scanRecordService.list(scanQw);

        Map<String, Map<LocalDate, Integer>> scansByFactory = new HashMap<>();
        for (ScanRecord sr : recentScans) {
            String fn = orderToFactory.get(sr.getOrderId());
            if (fn == null || sr.getScanTime() == null) continue;
            int qty = sr.getQuantity() != null ? sr.getQuantity() : 0;
            if (qty <= 0) continue;
            scansByFactory.computeIfAbsent(fn, k -> new HashMap<>())
                    .merge(sr.getScanTime().toLocalDate(), qty, Integer::sum);
        }

        Map<String, Integer> realDailyCapByFactory = new HashMap<>();
        for (Map.Entry<String, Map<LocalDate, Integer>> e : scansByFactory.entrySet()) {
            int totalQty = e.getValue().values().stream().mapToInt(Integer::intValue).sum();
            int workDays = e.getValue().size();
            realDailyCapByFactory.put(e.getKey(), Math.max(1, totalQty / Math.max(1, workDays)));
        }
        log.info("[排产建议] 近30天有扫码数据的工厂数={}, 扫码记录总数={}",
                 realDailyCapByFactory.size(), recentScans.size());
        return realDailyCapByFactory;
    }

    private Map<String, String> loadOrderToFactoryMap(Long tenantId) {
        QueryWrapper<ProductionOrder> allOrdersQw = new QueryWrapper<>();
        allOrdersQw.eq("tenant_id", tenantId)
                   .eq("delete_flag", 0)
                   .isNotNull("factory_name")
                   .select("id", "factory_name");
        return productionOrderService.list(allOrdersQw).stream()
                .filter(o -> o.getFactoryName() != null && o.getId() != null)
                .collect(Collectors.toMap(
                        o -> String.valueOf(o.getId()),
                        ProductionOrder::getFactoryName,
                        (a, b) -> a));
    }

    private SchedulePlan buildPlanForFactory(Factory f, Map<String, Integer> loadByFactory,
            Map<String, List<ProductionOrder>> completedByFactory,
            Map<String, Integer> realDailyCapByFactory, String requestedCategory, int quantity) {
        String factoryName = f.getFactoryName();
        int currentLoad = loadByFactory.getOrDefault(factoryName, 0);

        Integer realCap = realDailyCapByFactory.get(factoryName);
        boolean hasRealScanCapacity = realCap != null && realCap > 0;
        boolean capacityConfigured = f.getDailyCapacity() != null && f.getDailyCapacity() > 0
                && f.getDailyCapacity() != 500;
        int dailyCapacity = resolveDailyCapacity(realCap, hasRealScanCapacity, capacityConfigured, f);
        String capacitySource = resolveCapacitySource(hasRealScanCapacity, capacityConfigured);

        int availableCapacity = Math.max(0, dailyCapacity * 30 - currentLoad);
        int estimatedDays = Math.max(7, (int) Math.ceil((double) quantity / dailyCapacity));

        List<ProductionOrder> factoryDone = completedByFactory.getOrDefault(factoryName, Collections.emptyList());
        int capacityScore = computeCapacityScore(availableCapacity, quantity);
        int onTimeScore = computeOnTimeScore(factoryDone, factoryName);
        int categoryScore = computeCategoryScore(factoryDone, requestedCategory);
        int qualityScore = computeQualityScore(factoryDone);
        int matchScore = Math.min(100, capacityScore + onTimeScore + categoryScore + qualityScore);

        LocalDate suggestedStart = computeSuggestedStart(currentLoad, dailyCapacity);
        LocalDate estimatedEnd = suggestedStart.plusDays(estimatedDays);
        int[] dateRange = computeDateRange(estimatedDays, hasRealScanCapacity, capacityConfigured, factoryDone);
        LocalDate earliestEnd = suggestedStart.plusDays(dateRange[0]);
        LocalDate latestEnd = suggestedStart.plusDays(dateRange[1]);

        SchedulePlan plan = new SchedulePlan();
        plan.setFactoryName(factoryName);
        plan.setMatchScore(matchScore);
        plan.setCurrentLoad(currentLoad);
        plan.setDailyCapacity(dailyCapacity);
        plan.setAvailableCapacity(availableCapacity);
        plan.setSuggestedStart(suggestedStart.toString());
        plan.setEstimatedEnd(estimatedEnd.toString());
        plan.setEstimatedDays(estimatedDays);
        plan.setFastestDays(dateRange[0]);
        plan.setSlowestDays(dateRange[1]);
        plan.setEarliestEnd(earliestEnd.toString());
        plan.setLatestEnd(latestEnd.toString());
        plan.setCapacityScore(capacityScore);
        plan.setTimeScore(onTimeScore);
        plan.setCategoryScore(categoryScore);
        plan.setQualityScore(qualityScore);
        plan.setGanttItems(buildGantt(suggestedStart, estimatedDays));
        plan.setHasRealData(!factoryDone.isEmpty() || hasRealScanCapacity);
        plan.setCapacityConfigured(capacityConfigured || hasRealScanCapacity);
        plan.setRealDailyCapacity(hasRealScanCapacity && realCap != null ? realCap.intValue() : 0);
        plan.setCapacitySource(capacitySource);
        plan.setDataNote(buildDataNote(hasRealScanCapacity, !factoryDone.isEmpty(), capacityConfigured, realCap));
        return plan;
    }

    private int resolveDailyCapacity(Integer realCap, boolean hasRealScanCapacity,
            boolean capacityConfigured, Factory f) {
        if (hasRealScanCapacity) return realCap != null ? realCap.intValue() : 0;
        if (capacityConfigured) return f.getDailyCapacity();
        return 500;
    }

    private String resolveCapacitySource(boolean hasRealScanCapacity, boolean capacityConfigured) {
        if (hasRealScanCapacity) return "real";
        if (capacityConfigured) return "configured";
        return "default";
    }

    private int computeCapacityScore(int availableCapacity, int quantity) {
        double capacityRatio = availableCapacity > 0
                ? Math.min(1.0, (double) availableCapacity / quantity) : 0;
        return (int) (capacityRatio * 40);
    }

    private int computeOnTimeScore(List<ProductionOrder> factoryDone, String factoryName) {
        if (factoryDone.isEmpty()) return 18;
        long onTimeCount = factoryDone.stream()
                .filter(o -> o.getActualEndDate() != null && o.getPlannedEndDate() != null
                        && !o.getActualEndDate().isAfter(o.getPlannedEndDate()))
                .count();
        double onTimeRate = (double) onTimeCount / factoryDone.size();
        int score = (int) (onTimeRate * 30);
        log.debug("[排产建议] 工厂={} 交期达成率={}/{} ({}%) 得分={}",
                factoryName, onTimeCount, factoryDone.size(),
                String.format("%.0f", onTimeRate * 100), score);
        return score;
    }

    private int computeCategoryScore(List<ProductionOrder> factoryDone, String requestedCategory) {
        if (factoryDone.isEmpty() || requestedCategory == null || requestedCategory.isBlank()) return 12;
        long matchCount = factoryDone.stream()
                .filter(o -> requestedCategory.equals(o.getProductCategory()))
                .count();
        double matchRate = (double) matchCount / factoryDone.size();
        return (int) (matchRate * 20);
    }

    private int computeQualityScore(List<ProductionOrder> factoryDone) {
        if (factoryDone.isEmpty()) return 6;
        OptionalDouble avgOpt = factoryDone.stream()
                .filter(o -> o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                        && o.getCompletedQuantity() != null)
                .mapToDouble(o -> Math.min(1.0, (double) o.getCompletedQuantity() / o.getOrderQuantity()))
                .average();
        return avgOpt.isPresent() ? (int) (avgOpt.getAsDouble() * 10) : 6;
    }

    private LocalDate computeSuggestedStart(int currentLoad, int dailyCapacity) {
        double loadRatio = dailyCapacity > 0 ? (double) currentLoad / (dailyCapacity * 30) : 0;
        int startDelayDays = loadRatio < 0.5 ? 1 : (loadRatio < 0.8 ? 3 : 7);
        return LocalDate.now().plusDays(startDelayDays);
    }

    /** 返回 [fastestDays, slowestDays] */
    private int[] computeDateRange(int estimatedDays, boolean hasRealScanCapacity,
            boolean capacityConfigured, List<ProductionOrder> factoryDone) {
        int rangeBufferDays = hasRealScanCapacity && !factoryDone.isEmpty()
                ? Math.max(1, (int) Math.ceil(estimatedDays * 0.08))
                : capacityConfigured
                ? Math.max(2, (int) Math.ceil(estimatedDays * 0.15))
                : Math.max(3, (int) Math.ceil(estimatedDays * 0.20));
        int fastestDays = Math.max(3, estimatedDays - rangeBufferDays);
        int slowestDays = Math.max(fastestDays, estimatedDays + rangeBufferDays * 2);
        return new int[]{fastestDays, slowestDays};
    }

    private String buildDataNote(boolean hasRealScanCapacity, boolean hasRealData,
            boolean capacityConfigured, Integer realCap) {
        if (hasRealScanCapacity && hasRealData) return null;
        if (hasRealScanCapacity) return "产能基于近30天实测（" + realCap + "件/天）；交期评分暂待完成订单数据";
        if (!hasRealData && !capacityConfigured) return "暂无生产数据，产能与评分均为估算参考值";
        if (!hasRealData) return "产能已配置，交期/品类评分暂无历史完成订单参考";
        return "产能未配置，建议填写日产能或积累扫码数据";
    }

    private void enhanceWithOptimization(SchedulingSuggestionResponse resp,
            SchedulingSuggestionRequest req, int quantity, String requestedCategory) {
        if (optimizationSolverOrchestrator == null || req.getStyleNo() == null || req.getStyleNo().isBlank()) return;
        try {
            String optRequest = String.format("排产 %d 件 %s 品类 %s",
                    quantity, req.getStyleNo(),
                    requestedCategory != null ? requestedCategory : "");
            OptimizationSolverOrchestrator.SchedulingSolution optSolution =
                    optimizationSolverOrchestrator.solveScheduling(optRequest, "");
            if (optSolution != null && optSolution.getAssignments() != null
                    && !optSolution.getAssignments().isEmpty()) {
                Map<String, Object> optHint = new LinkedHashMap<>();
                optHint.put("totalScore", optSolution.getTotalScore());
                optHint.put("totalCost", optSolution.getTotalCost());
                optHint.put("feasible", optSolution.isFeasible());
                optHint.put("assignments", optSolution.getAssignments().size());
                optHint.put("explanation", optSolution.getExplanation());
                resp.setOptimizationHint(optHint);
                log.info("[排产建议] 优化求解增强完成: totalScore={}", optSolution.getTotalScore());
            }
        } catch (Exception e) {
            log.debug("[排产建议] 优化求解增强跳过（不影响主流程）: {}", e.getMessage());
        }
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
