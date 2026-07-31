package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingRequest;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse.ConstraintStatus;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse.GanttTask;
import com.fashion.supplychain.intelligence.dto.ApsSchedulingResponse.ScheduleSolution;
import com.fashion.supplychain.intelligence.entity.ProcessCapacity;
import com.fashion.supplychain.intelligence.service.FactoryCalendarService;
import com.fashion.supplychain.intelligence.service.ProcessCapacityService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * APS 排产约束求解 Helper（算法 + 数据加载）
 *
 * <p>工序依赖（参考 ProductionConstants.FIXED_PRODUCTION_NODES，扩展"质检"）：
 * 采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 质检 → 入库</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApsSchedulingHelper {

    private final FactoryCalendarService factoryCalendarService;
    private final ProductionOrderService productionOrderService;
    private final FactoryService factoryService;
    private final ProcessCapacityService processCapacityService;

    /** 标准工序顺序（顺序不可逆，可跳过） */
    public static final List<String> PROCESS_SEQUENCE = List.of(
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "质检", "入库");

    private static final long URGENT_DAYS = 7;
    private static final double W_CAPACITY = 0.40;
    private static final double W_DELIVERY = 0.30;
    private static final double W_CATEGORY = 0.20;
    private static final double W_LOAD = 0.10;

    // ═══════════════════════════════════════════════════════════════════════
    // 数据加载（P0铁律4：多租户隔离）
    // ═══════════════════════════════════════════════════════════════════════

    public List<ProductionOrder> loadOrders(ApsSchedulingRequest request, Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).in("status", "pending", "delayed");
        if (request.getOrderIds() != null && !request.getOrderIds().isEmpty()) {
            qw.in("id", request.getOrderIds());
        }
        return productionOrderService.list(qw);
    }

    public List<Factory> loadFactories(Long tenantId) {
        QueryWrapper<Factory> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).eq("status", "active");
        return factoryService.list(qw);
    }

    public Map<String, Map<String, ProcessCapacity>> loadCapacityMap() {
        return processCapacityService.loadCapacityByFactory();
    }

    public Map<String, List<ProductionOrder>> loadCompletedOrdersByFactory(Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).eq("status", "completed")
                .isNotNull("factory_name").isNotNull("planned_end_date").isNotNull("actual_end_date");
        return productionOrderService.list(qw).stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));
    }

    public Map<String, Integer> loadFactoryLoadMap(Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).in("status", "pending", "production", "delayed");
        return productionOrderService.list(qw).stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName,
                        Collectors.summingInt(ApsSchedulingHelper::orderQuantity)));
    }

    private static int orderQuantity(ProductionOrder o) {
        return o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 排序与评分
    // ═══════════════════════════════════════════════════════════════════════

    public List<ProductionOrder> sortOrdersByPriority(List<ProductionOrder> orders) {
        LocalDateTime now = LocalDateTime.now();
        return orders.stream()
                .sorted(Comparator
                        .comparingInt((ProductionOrder o) -> priorityRank(o, now))
                        .thenComparing(o -> o.getPlannedEndDate() == null ? LocalDateTime.MAX : o.getPlannedEndDate()))
                .collect(Collectors.toList());
    }

    private int priorityRank(ProductionOrder o, LocalDateTime now) {
        if (o.getPlannedEndDate() == null) return 2;
        if (o.getPlannedEndDate().isBefore(now)) return 0;
        if (o.getPlannedEndDate().isBefore(now.plusDays(URGENT_DAYS))) return 1;
        return 2;
    }

    public String priorityLabel(ProductionOrder o) {
        LocalDateTime now = LocalDateTime.now();
        if (o.getPlannedEndDate() == null) return "NORMAL";
        if (o.getPlannedEndDate().isBefore(now)) return "OVERDUE";
        if (o.getPlannedEndDate().isBefore(now.plusDays(URGENT_DAYS))) return "URGENT";
        return "NORMAL";
    }

    public FactoryScore scoreFactory(ProductionOrder order, Factory factory,
                                     Map<String, ProcessCapacity> capacityByProc,
                                     int currentLoad, List<ProductionOrder> completedOrders) {
        int quantity = orderQuantity(order);
        int dailyCap = resolveDailyCapacity(factory, capacityByProc);
        int availableCap = Math.max(0, dailyCap * 30 - currentLoad);
        double capRatio = quantity > 0 ? Math.min(1.0, (double) availableCap / quantity) : 1.0;
        int capacityScore = (int) (capRatio * 100 * W_CAPACITY);
        int deliveryScore = computeDeliveryScore(completedOrders);
        int categoryScore = computeCategoryScore(completedOrders, order.getProductCategory());
        double loadRatio = dailyCap > 0 ? Math.min(1.0, (double) currentLoad / (dailyCap * 30.0)) : 1.0;
        int loadScore = (int) ((1.0 - loadRatio) * 100 * W_LOAD);
        int matchScore = Math.min(100, capacityScore + deliveryScore + categoryScore + loadScore);
        return new FactoryScore(capacityScore, deliveryScore, categoryScore, loadScore, matchScore, dailyCap);
    }

    private int resolveDailyCapacity(Factory factory, Map<String, ProcessCapacity> capacityByProc) {
        ProcessCapacity sewing = capacityByProc.get("车缝");
        if (sewing != null && sewing.getDailyCapacity() != null && sewing.getDailyCapacity() > 0) {
            return sewing.getDailyCapacity();
        }
        if (factory.getDailyCapacity() != null && factory.getDailyCapacity() > 0) {
            return factory.getDailyCapacity();
        }
        return 500;
    }

    private int computeDeliveryScore(List<ProductionOrder> completedOrders) {
        if (completedOrders == null || completedOrders.isEmpty()) return (int) (60 * W_DELIVERY);
        long onTime = completedOrders.stream()
                .filter(o -> o.getActualEndDate() != null && o.getPlannedEndDate() != null
                        && !o.getActualEndDate().isAfter(o.getPlannedEndDate()))
                .count();
        return (int) (((double) onTime / completedOrders.size()) * 100 * W_DELIVERY);
    }

    private int computeCategoryScore(List<ProductionOrder> completedOrders, String category) {
        if (completedOrders == null || completedOrders.isEmpty() || category == null || category.isBlank()) {
            return (int) (60 * W_CATEGORY);
        }
        long match = completedOrders.stream().filter(o -> category.equals(o.getProductCategory())).count();
        return (int) (((double) match / completedOrders.size()) * 100 * W_CATEGORY);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 甘特图 + 瓶颈 + 约束检查
    // ═══════════════════════════════════════════════════════════════════════

    public List<GanttTask> buildGanttTasks(LocalDate startDate, int quantity,
                                           Map<String, ProcessCapacity> capacityByProc,
                                           String factoryId, boolean skipHolidays) {
        List<GanttTask> tasks = new ArrayList<>();
        LocalDate cursor = startDate;
        int seq = 0;
        for (String process : PROCESS_SEQUENCE) {
            ProcessCapacity pc = capacityByProc.get(process);
            if (pc == null || pc.getDailyCapacity() == null || pc.getDailyCapacity() <= 0) continue;
            int dailyCap = pc.getDailyCapacity();
            int days = Math.max(1, (int) Math.ceil((double) quantity / dailyCap));
            LocalDate taskStart = cursor;
            LocalDate taskEnd = advanceWorkdays(cursor, days, factoryId, skipHolidays);
            GanttTask task = new GanttTask();
            task.setProcess(process);
            task.setSequence(++seq);
            task.setStartDate(taskStart.toString());
            task.setEndDate(taskEnd.toString());
            task.setDays(days);
            task.setDailyCapacity(dailyCap);
            tasks.add(task);
            cursor = taskEnd.plusDays(1);
        }
        return tasks;
    }

    private LocalDate advanceWorkdays(LocalDate start, int workDays, String factoryId, boolean skipHolidays) {
        LocalDate date = start;
        int counted = 0;
        int safety = 0;
        while (counted < workDays && safety < 365) {
            if (!skipHolidays || isWorkday(factoryId, date)) {
                counted++;
                if (counted == workDays) break;
            }
            date = date.plusDays(1);
            safety++;
        }
        return date;
    }

    private boolean isWorkday(String factoryId, LocalDate date) {
        if (factoryId == null) return true;
        try {
            return factoryCalendarService.isWorkday(factoryId, date);
        } catch (Exception e) {
            return true;
        }
    }

    public String findBottleneck(List<GanttTask> tasks) {
        if (tasks == null || tasks.isEmpty()) return null;
        return tasks.stream().max(Comparator.comparingInt(GanttTask::getDays))
                .map(GanttTask::getProcess).orElse(null);
    }

    public void markBottleneck(List<GanttTask> tasks) {
        String bottleneck = findBottleneck(tasks);
        if (bottleneck != null) {
            tasks.stream().filter(t -> bottleneck.equals(t.getProcess())).forEach(t -> t.setBottleneck(true));
        }
    }

    public void checkConstraints(ScheduleSolution solution, ProductionOrder order, int dailyCap) {
        ConstraintStatus status = new ConstraintStatus();
        List<String> violations = new ArrayList<>();
        status.setCapacityMet(dailyCap > 0);
        if (dailyCap <= 0) violations.add("工厂日产能为0，无法排产");
        if (order.getPlannedEndDate() != null && solution.getEndDate() != null) {
            LocalDate plannedEnd = order.getPlannedEndDate().toLocalDate();
            LocalDate scheduleEnd = LocalDate.parse(solution.getEndDate());
            boolean deadlineMet = !scheduleEnd.isAfter(plannedEnd);
            status.setDeadlineMet(deadlineMet);
            if (!deadlineMet) violations.add("排产结束日期超过计划交期");
        } else {
            status.setDeadlineMet(true);
        }
        status.setCalendarMet(true);
        status.setViolations(violations);
        solution.setConstraints(status);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 方案构建与辅助
    // ═══════════════════════════════════════════════════════════════════════

    public ScheduleSolution buildSolution(ProductionOrder order, Factory factory, FactoryScore score,
                                          Map<String, Map<String, ProcessCapacity>> capacityMap,
                                          LocalDate scheduleStart, boolean skipHolidays) {
        int quantity = orderQuantity(order);
        Map<String, ProcessCapacity> cap = capacityMap.getOrDefault(factory.getFactoryName(), Collections.emptyMap());
        String factoryId = factory.getId();
        List<GanttTask> ganttTasks = buildGanttTasks(scheduleStart, quantity, cap, factoryId, skipHolidays);
        markBottleneck(ganttTasks);

        ScheduleSolution solution = new ScheduleSolution();
        solution.setOrderId(order.getId());
        solution.setOrderNo(order.getOrderNo());
        solution.setStyleNo(order.getStyleNo());
        solution.setQuantity(quantity);
        solution.setPlannedEndDate(order.getPlannedEndDate() != null ? order.getPlannedEndDate().toLocalDate().toString() : null);
        solution.setPriority(priorityLabel(order));
        solution.setFactoryId(factoryId);
        solution.setFactoryName(factory.getFactoryName());
        solution.setMatchScore(score.matchScore);
        solution.setCapacityScore(score.capacityScore);
        solution.setDeliveryScore(score.deliveryScore);
        solution.setCategoryScore(score.categoryScore);
        solution.setLoadScore(score.loadScore);
        solution.setStartDate(ganttTasks.isEmpty() ? scheduleStart.toString() : ganttTasks.get(0).getStartDate());
        solution.setEndDate(ganttTasks.isEmpty() ? scheduleStart.toString() : ganttTasks.get(ganttTasks.size() - 1).getEndDate());
        solution.setTotalDays(ganttTasks.stream().mapToInt(GanttTask::getDays).sum());
        solution.setGanttTasks(ganttTasks);
        solution.setBottleneckProcess(findBottleneck(ganttTasks));
        solution.setExplanation(String.format("订单 %s (%d件) 分配至 %s，综合评分 %d（产能%d/交期%d/品类%d/负载%d），瓶颈工序：%s",
                order.getOrderNo(), quantity, factory.getFactoryName(), score.matchScore,
                score.capacityScore, score.deliveryScore, score.categoryScore, score.loadScore,
                findBottleneck(ganttTasks) != null ? findBottleneck(ganttTasks) : "无"));
        checkConstraints(solution, order, score.dailyCapacity);
        return solution;
    }

    public LocalDate parseStartDate(ApsSchedulingRequest request) {
        if (request.getStartDate() != null && !request.getStartDate().isBlank()) {
            try { return LocalDate.parse(request.getStartDate()); } catch (Exception ignored) {}
        }
        return LocalDate.now().plusDays(1);
    }

    /** 解析工厂ID（Factory.id 已为 UUID 字符串，直接透传） */
    public String parseFactoryId(String factoryId) {
        return factoryId;
    }

    public Map<String, Object> buildSummary(List<ScheduleSolution> solutions) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalOrders", solutions.size());
        summary.put("feasible", solutions.stream().filter(s -> s.getConstraints() != null && s.getConstraints().isCapacityMet()).count());
        summary.put("overdue", solutions.stream().filter(s -> "OVERDUE".equals(s.getPriority())).count());
        summary.put("urgent", solutions.stream().filter(s -> "URGENT".equals(s.getPriority())).count());
        return summary;
    }

    /** 工厂评分结果 */
    public static class FactoryScore {
        public final int capacityScore;
        public final int deliveryScore;
        public final int categoryScore;
        public final int loadScore;
        public final int matchScore;
        public final int dailyCapacity;

        public FactoryScore(int capacityScore, int deliveryScore, int categoryScore,
                            int loadScore, int matchScore, int dailyCapacity) {
            this.capacityScore = capacityScore;
            this.deliveryScore = deliveryScore;
            this.categoryScore = categoryScore;
            this.loadScore = loadScore;
            this.matchScore = matchScore;
            this.dailyCapacity = dailyCapacity;
        }
    }
}
