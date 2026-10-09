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
