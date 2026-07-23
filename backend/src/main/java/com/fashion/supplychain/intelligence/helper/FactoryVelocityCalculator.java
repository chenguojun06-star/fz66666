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
 * <p>算法与 DeliveryPredictionOrchestrator 对齐（保持一致性）：
 * EWMA(α=0.33) + 趋势检测(最小二乘,±25%) + 季节性修正(周末70%)
 */
@Component
@Slf4j
public class FactoryVelocityCalculator {

    private static final int WINDOW_DAYS = 14;
    private static final double ALPHA = 0.33;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    /**
     * 计算工厂级日均产能（基于近14天该工厂所有在制订单的扫码聚合）
     *
     * @param factoryName 工厂名
     * @return 日均产能（件/天），<=0 表示无扫码数据
     */
    public double computeFactoryVelocity(String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return 0;

        // 1. 查该工厂所有在制订单ID
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq("tenant_id", UserContext.tenantId())
           .eq("factory_name", factoryName)
           .eq("delete_flag", 0);
        List<ProductionOrder> orders = productionOrderService.list(oqw);
        if (orders.isEmpty()) return 0;

        Set<String> orderIds = orders.stream()
                .map(o -> String.valueOf(o.getId()))
                .collect(Collectors.toSet());

        // 2. 拉取近14天扫码记录
        LocalDateTime now = LocalDateTime.now();
        double[] dailyQty = new double[WINDOW_DAYS];
        boolean hasAnyData = false;
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
            dailyQty[i] = dayQty;
            if (dayQty > 0) hasAnyData = true;
        }
        if (!hasAnyData) return 0;

        // 3. EWMA 平滑
        double ewma = 0;
        int firstValidIdx = -1;
        for (int i = 0; i < WINDOW_DAYS; i++) {
            if (dailyQty[i] > 0) {
                ewma = dailyQty[i];
                firstValidIdx = i;
                break;
            }
        }
        if (firstValidIdx < 0) return 0;
        for (int i = firstValidIdx + 1; i < WINDOW_DAYS; i++) {
            if (dailyQty[i] > 0) {
                ewma = ALPHA * dailyQty[i] + (1 - ALPHA) * ewma;
            } else {
                ewma = ewma * 0.95;
            }
        }

        // 4. 趋势检测（最小二乘斜率）
        int validDays = 0;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < WINDOW_DAYS; i++) {
            if (dailyQty[i] > 0) {
                double x = i, y = dailyQty[i];
                sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
                validDays++;
            }
        }
        double trendBoost = 0;
        if (validDays >= 3 && ewma > 0) {
            double slope = (validDays * sumXY - sumX * sumY) / (validDays * sumX2 - sumX * sumX);
            double relativeSlope = slope / ewma;
            trendBoost = Math.max(-0.25, Math.min(0.25, relativeSlope * 3.0));
        }

        // 5. 季节性修正（未来7天周末占比）
        int weekendDays = 0;
        for (int i = 1; i <= 7; i++) {
            int dow = now.plusDays(i).getDayOfWeek().getValue();
            if (dow == 6 || dow == 7) weekendDays++;
        }
        double seasonFactor = 1.0 - (weekendDays / 7.0) * 0.30;

        double velocity = ewma * (1 + trendBoost) * seasonFactor;
        return Math.max(0, velocity);
    }

    /**
     * 工厂当前在手总件数（所有在制订单的 orderQuantity 之和）
     */
    public long computeFactoryPendingQuantity(String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return 0;
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", UserContext.tenantId())
           .eq("factory_name", factoryName)
           .eq("delete_flag", 0)
           .notIn("status", Arrays.asList("completed", "scrapped", "closed"));
        return productionOrderService.list(qw).stream()
                .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
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
