package com.fashion.supplychain.intelligence.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工厂级速度计算 Helper（无状态）
 *
 * <p>从 DeliveryPredictionOrchestrator 拆薄，专门处理"按工厂聚合"的速度计算。
 * 与 DeliveryPredictionOrchestrator.computeWeightedVelocity(orderId) 区别：
 * 这里聚合该工厂所有在制订单的扫码记录，而非单订单。
 *
 * <p>日均产能口径（2026-10-09 统一）：窗口内总扫码件数 ÷ 有生产记录的天数，
 * 与 FactoryCapacityOrchestrator（产能卡片）、CapacityGapOrchestrator（缺口分析）一致，
 * 供 PreOrderDeliveryPredictionOrchestrator 做交期预测与置信度评估。
 */
@Component
@Slf4j
public class FactoryVelocityCalculator {

    private static final int WINDOW_DAYS = 14;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    /**
     * 工厂速度采样：日均产能 + 有效生产天数（窗口内有扫码的天数）。
     *
     * @param velocity    日均产能（件/天），<=0 表示无扫码数据
     * @param activeDays  窗口内有生产记录的天数（置信度评估用）
     * @param windowDays  统计窗口天数
     */
    public record VelocitySample(double velocity, int activeDays, int windowDays) {
    }

    /**
     * 计算工厂级日均产能（基于近14天该工厂所有在制订单的扫码聚合）。
     *
     * <p>2026-10-09 口径统一：= 窗口内总扫码件数 ÷ 有生产记录的天数（活跃天数），
     * 与产能卡片（FactoryCapacityOrchestrator）和产能缺口分析（CapacityGapOrchestrator）
     * 使用同一口径，避免同一工厂出现 106.7 / 1600 / 1737.1 三个不同"日均产能"。
     * 原 EWMA+趋势+季节算法会把单日爆发平滑成"持续产能"（14天仅2天生产却报 1737 件/天），
     * 已废弃；样本是否充分改由 activeDays 暴露给置信度评估。
     *
     * @param factoryName 工厂名
     * @return 速度采样（velocity <=0 表示无扫码数据）
     */
    public VelocitySample computeVelocitySample(String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return new VelocitySample(0, 0, WINDOW_DAYS);

        // 1. 查该工厂所有在制订单ID
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq("tenant_id", UserContext.tenantId())
           .eq("factory_name", factoryName)
           .eq("delete_flag", 0);
        List<ProductionOrder> orders = productionOrderService.list(oqw);
        if (orders.isEmpty()) return new VelocitySample(0, 0, WINDOW_DAYS);

        Set<String> orderIds = orders.stream()
                .map(o -> String.valueOf(o.getId()))
                .collect(Collectors.toSet());

        // 2. 拉取近14天扫码记录
        LocalDateTime now = LocalDateTime.now();
        double totalQty = 0;
        int activeDays = 0;
        for (int i = 0; i < WINDOW_DAYS; i++) {
            LocalDateTime dayStart = now.minusDays(WINDOW_DAYS - i).toLocalDate().atStartOfDay();
            LocalDateTime dayEnd = dayStart.plusDays(1);
            QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
            sqw.in("order_id", orderIds)
               .eq("scan_result", "success")
               .ne("scan_type", "orchestration")
               .gt("quantity", 0)
               .between("scan_time", dayStart, dayEnd);
            long dayQty = scanRecordService.list(sqw).stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
            if (dayQty > 0) {
                totalQty += dayQty;
                activeDays++;
            }
        }
        if (activeDays == 0) return new VelocitySample(0, 0, WINDOW_DAYS);

        // 3. 统一口径：总扫码 ÷ 活跃天数
        double velocity = totalQty / activeDays;
        return new VelocitySample(Math.max(0, velocity), activeDays, WINDOW_DAYS);
    }

    /**
     * 计算工厂级日均产能（兼容入口，详见 {@link #computeVelocitySample}）
     *
     * @param factoryName 工厂名
     * @return 日均产能（件/天），<=0 表示无扫码数据
     */
    public double computeFactoryVelocity(String factoryName) {
        return computeVelocitySample(factoryName).velocity();
    }

    /**
     * 逐日产出序列（2026-10-29 新增）— 供「工厂全动态详情」产能走势图使用。
     *
     * <p>与 {@link #computeVelocitySample} 的**口径完全对齐**（同一订单集合、同一过滤条件、
     * 同一窗口 today-{@code days} ~ today-1），因此由本序列算出的「有产出日均」
     * 与预下单预测里的 factoryDailyVelocity 是同值 —— 避免同一抽屉里出现两个"日均"。
     *
     * <p>性能：原逐日算法是「一天一次查询」（14 次），这里合并成**一次分组查询**。
     *
     * @param factoryName 工厂名
     * @param days        窗口天数（近 N 个完整日，截至昨天）
     * @return 日期序列 + 每日件数
     */
    public DailySeries computeDailySeries(String factoryName, int days) {
        int window = Math.max(1, Math.min(90, days));
        List<LocalDate> dateList = new ArrayList<>(window);
        LocalDate today = LocalDate.now();
        for (int i = window; i >= 1; i--) {
            dateList.add(today.minusDays(i));
        }
        int[] qty = new int[window];
        if (factoryName == null || factoryName.isBlank() || UserContext.tenantId() == null) {
            return new DailySeries(dateList, qty);
        }

        // 1. 该工厂的订单集合（与 computeVelocitySample 一致：按 factory_name + 未删除）
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq("tenant_id", UserContext.tenantId())
           .eq("factory_name", factoryName)
           .eq("delete_flag", 0);
        List<ProductionOrder> orders = productionOrderService.list(oqw);
        if (orders.isEmpty()) return new DailySeries(dateList, qty);

        Set<String> orderIds = orders.stream()
                .map(o -> String.valueOf(o.getId()))
                .collect(Collectors.toSet());

        // 2. 一次分组查询取逐日产量（过滤条件与 computeVelocitySample 逐字对齐）
        LocalDateTime start = dateList.get(0).atStartOfDay();
        LocalDateTime end = dateList.get(window - 1).plusDays(1).atStartOfDay();
        try {
            QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
            sqw.select("DATE(scan_time) as d", "COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
               .in("order_id", orderIds)
               .eq("scan_result", "success")
               .ne("scan_type", "orchestration")
               .gt("quantity", 0)
               .ge("scan_time", start)
               .lt("scan_time", end)
               .groupBy("DATE(scan_time)");
            List<Map<String, Object>> rows = scanRecordService.getBaseMapper().selectMaps(sqw);
            Map<String, Integer> byDate = new HashMap<>();
            for (Map<String, Object> row : rows) {
                Object d = row.get("d") != null ? row.get("d") : row.get("D");
                Object t = row.get("total") != null ? row.get("total") : row.get("TOTAL");
                if (d == null || t == null) continue;
                byDate.put(String.valueOf(d), ((Number) t).intValue());
            }
            for (int i = 0; i < window; i++) {
                qty[i] = byDate.getOrDefault(dateList.get(i).toString(), 0);
            }
        } catch (Exception e) {
            log.warn("[工厂逐日产出] 查询失败，返回空序列: {}", e.getMessage());
        }
        return new DailySeries(dateList, qty);
    }

    /**
     * 逐日产出序列值对象。
     *
     * @param dates      日期（升序，最后一个通常是昨天）
     * @param quantities 与 dates 一一对应的每日件数
     */
    public record DailySeries(List<LocalDate> dates, int[] quantities) {

        /** 窗口内总件数 */
        public long total() {
            long sum = 0;
            for (int q : quantities) sum += q;
            return sum;
        }

        /** 有产出的天数 */
        public int activeDays() {
            int n = 0;
            for (int q : quantities) {
                if (q > 0) n++;
            }
            return n;
        }
    }

    /**
     * 计算工厂在手总剩余件数（所有非终止状态在制订单的剩余量之和）。
     *
     * <p>2026-10-09 口径修复：
     * <ul>
     *   <li>终止状态统一用 OrderStatusConstants.TERMINAL_STATUSES（原仅排除 completed/scrapped/closed，
     *       漏 cancelled/archived，与其他查询口径不一致）</li>
     *   <li>取"剩余量"而非 order_quantity 总数：progress=100% 已完成未关单的订单不再被算进在手负载</li>
     * </ul>
     */
    public long computeFactoryPendingQuantity(String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return 0;
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", UserContext.tenantId())
           .eq("factory_name", factoryName)
           .eq("delete_flag", 0)
           .notIn("status", com.fashion.supplychain.common.constant.OrderStatusConstants.TERMINAL_STATUSES);
        return productionOrderService.list(qw).stream()
                .filter(o -> !OrderWorkloadHelper.isCompletedPendingClosure(o))
                .mapToLong(OrderWorkloadHelper::remainingQuantity)
                .sum();
    }

    /**
     * P80完工天数（180天内同工厂历史实际完工记录的80百分位）
     * 复用 DeliveryPredictionOrchestrator.calcP80Days 逻辑
     */
    public OptionalDouble calcP80Days(String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return OptionalDouble.empty();
        try {
            QueryWrapper<IntelligencePredictionLog> qw = new QueryWrapper<>();
            qw.eq("tenant_id", UserContext.tenantId())
              .eq("factory_name", factoryName)
              .isNotNull("actual_finish_time")
              .ge("create_time", LocalDateTime.now().minusDays(180));
            List<IntelligencePredictionLog> logs = predictionLogMapper.selectList(qw);
            if (logs.size() < 3) return OptionalDouble.empty();
            List<Double> actualDays = logs.stream()
                    .filter(l -> l.getActualFinishTime() != null && l.getCreateTime() != null)
                    .map(l -> (double) ChronoUnit.DAYS.between(l.getCreateTime(), l.getActualFinishTime()))
                    .filter(d -> d > 0 && d < 365)
                    .sorted()
                    .collect(Collectors.toList());
            if (actualDays.size() < 3) return OptionalDouble.empty();
            int idx = (int) Math.ceil(actualDays.size() * 0.8) - 1;
            return OptionalDouble.of(actualDays.get(idx));
        } catch (Exception e) {
            log.debug("[预下单预测] P80计算异常: {}", e.getMessage());
            return OptionalDouble.empty();
        }
    }

    /**
     * 基于工厂历史偏差修正 mlDays（|偏差|<=30天才应用）
     * 复用 DeliveryPredictionOrchestrator.computeCalibratedMlDays 逻辑
     */
    public long computeCalibratedMlDays(String factoryName, long mlDays) {
        if (factoryName == null || factoryName.isBlank()) return mlDays;
        try {
            Double avgBiasDays = predictionLogMapper.getAvgBiasDays(
                    UserContext.tenantId(), factoryName, 3);
            if (avgBiasDays != null && Math.abs(avgBiasDays) <= 30) {
                long correction = Math.round(avgBiasDays);
                return Math.max(1, mlDays + correction);
            }
        } catch (Exception e) {
            log.debug("[预下单预测] 校准查询失败: {}", e.getMessage());
        }
        return mlDays;
    }
}
