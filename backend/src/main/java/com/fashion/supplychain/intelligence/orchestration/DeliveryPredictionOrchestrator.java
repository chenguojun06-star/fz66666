package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 完工日期AI预测编排器 — 加权移动平均 + 三档置信区间
 *
 * <p>算法：取近7天日产量，用加权移动平均（近日权重更高）预测日均速度，
 * 结合剩余件数推演乐观/可能/悲观三档完工日期。
 * <pre>
 *   velocity = WMA(day_qty, weights=[1,2,3,4,5,6,7])
 *   remaining = total - completed
 *   optimistic = remaining / (velocity * 1.2)
 *   mostLikely = remaining / velocity
 *   pessimistic = remaining / (velocity * 0.7)
 * </pre>
 */
@Service
@Lazy
@Slf4j
public class DeliveryPredictionOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    private volatile Boolean predictionLogExtraColumnsReady;
    private final java.util.concurrent.locks.ReentrantLock schemaCheckLock = new java.util.concurrent.locks.ReentrantLock();

    public DeliveryPredictionResponse predict(DeliveryPredictionRequest request) {
        DeliveryPredictionResponse resp = new DeliveryPredictionResponse();
        if (request == null || request.getOrderId() == null) {
            resp.setRationale("请提供订单ID");
            return resp;
        }

        try {
            ProductionOrder order = loadOrder(request.getOrderId().trim());
            if (order == null) {
                resp.setRationale("订单不存在，请确认订单号");
                return resp;
            }

            long remaining = fillBaseInfo(resp, order);

            if (remaining == 0) {
                fillCompletedResponse(resp);
                return resp;
            }

            // 获取近7天日产量
            double velocity = computeWeightedVelocity(order.getId());
            resp.setDailyVelocity(Math.round(velocity * 10.0) / 10.0);

            if (velocity <= 0) {
                resp.setRationale("近7天无扫码记录，无法预测");
                resp.setConfidence(10);
                return resp;
            }

            LocalDate today = LocalDate.now();
            long optDays = Math.max(1, Math.round(remaining / (velocity * 1.2)));
            long mlDays  = Math.max(1, Math.round(remaining / velocity));
            long pesDays = Math.max(1, Math.round(remaining / (velocity * 0.7)));

            // ── 自我校准：基于工厂历史偏差修正 mlDays ──
            long correctedMlDays = computeCalibratedMlDays(order, mlDays);

            // ── P80 历史百分位混合 ──
            long blendedMlDays = correctedMlDays;
            String p80Hint = "";
            OptionalDouble p80Opt = calcP80Days(UserContext.tenantId(), order.getFactoryName());
            if (p80Opt.isPresent()) {
                long p80Days = Math.round(p80Opt.getAsDouble());
                blendedMlDays = Math.max(1, Math.round(correctedMlDays * 0.6 + p80Days * 0.4));
                p80Hint = String.format("；P80历史%d天（混合后%d天）", p80Days, blendedMlDays);
            }
            resp.setOptimisticDate(today.plusDays(optDays).format(DATE_FMT));
            resp.setMostLikelyDate(today.plusDays(blendedMlDays).format(DATE_FMT));
            resp.setPessimisticDate(today.plusDays(pesDays).format(DATE_FMT));

            // 是否延期
            if (order.getPlannedEndDate() != null) {
                resp.setLikelyDelayed(today.plusDays(blendedMlDays).isAfter(
                        order.getPlannedEndDate().toLocalDate()));
            }

            // 置信度（P80样本越多精度越高）
            int confidence = p80Opt.isPresent()
                    ? Math.min(85, 45 + (int) velocity)
                    : Math.min(90, 40 + (int) velocity);
            resp.setConfidence(confidence);
            resp.setRationale(String.format(
                    "基于近7天加权日均产量 %.1f 件/天，剩余 %d 件，预计 %d ~ %d 天完成%s",
                    velocity, remaining, optDays, pesDays, p80Hint));

            // ── 保存预测日志（数据飞轮）──
            savePredictionLog(order, today, blendedMlDays, velocity, remaining, confidence);

        } catch (Exception e) {
            log.error("[交期预测] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
            resp.setRationale("数据加载异常，请稍后重试");
        }
        return resp;
    }

    /** 按主键或订单号加载订单，支持纯数字ID与带/不带PO前缀的订单号 */
    private ProductionOrder loadOrder(String idStr) {
        ProductionOrder order = null;
        // 纯数字时先按主键查
        if (idStr.matches("\\d+")) {
            try {
                order = productionOrderService.getById(Long.parseLong(idStr));
                if (order != null) {
                    TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
                }
            } catch (Exception e) {
                log.debug("Non-critical error: {}", e.getMessage());
            }
        }
        // 主键未命中或含字母（如 PO20260228001），改按订单号查，支持带/不带 PO 前缀
        if (order == null) {
            final String noStr = idStr;
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", UserContext.tenantId())
              .and(w -> w.eq("order_no", noStr)
                         .or().eq("order_no", "PO" + noStr)
                         .or().eq("order_no", noStr.replaceFirst("^(?i)PO", "")));
            order = productionOrderService.getOne(qw);
        }
        return order;
    }

    /** 订单已完成时填充响应（三档日期均为今天，置信度95） */
    private void fillCompletedResponse(DeliveryPredictionResponse resp) {
        resp.setMostLikelyDate(LocalDate.now().format(DATE_FMT));
        resp.setOptimisticDate(LocalDate.now().format(DATE_FMT));
        resp.setPessimisticDate(LocalDate.now().format(DATE_FMT));
        resp.setDailyVelocity(0);
        resp.setLikelyDelayed(false);
        resp.setConfidence(95);
        resp.setRationale("订单已完成");
    }

    /** 填充订单基础信息（ID/号/剩余量/计划截止日），返回剩余件数 */
    private long fillBaseInfo(DeliveryPredictionResponse resp, ProductionOrder order) {
        resp.setOrderId(order.getId());
        resp.setOrderNo(order.getOrderNo());
        int totalQty = resolveTotal(order);
        int completedQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        long remaining = Math.max(0, totalQty - completedQty);
        resp.setRemainingQty(remaining);
        if (order.getPlannedEndDate() != null) {
            resp.setPlannedDeadline(order.getPlannedEndDate().format(DATE_FMT));
        }
        return remaining;
    }

    /** 基于工厂历史偏差修正 mlDays（|偏差|<=30 天才应用） */
    private long computeCalibratedMlDays(ProductionOrder order, long mlDays) {
        long correctedMlDays = mlDays;
        if (order.getFactoryName() == null || order.getFactoryName().isBlank()) {
            return correctedMlDays;
        }
        try {
            Double avgBiasDays = predictionLogMapper.getAvgBiasDays(
                    UserContext.tenantId(), order.getFactoryName(), 3);
            if (avgBiasDays != null && Math.abs(avgBiasDays) <= 30) {
                long correction = Math.round(avgBiasDays);
                correctedMlDays = Math.max(1, mlDays + correction);
                if (correction != 0) {
                    log.debug("[交期预测] 工厂 {} 历史偏差 {:.1f}天，mlDays {} -> {}",
                            order.getFactoryName(), avgBiasDays, mlDays, correctedMlDays);
                }
            }
        } catch (Exception ce) {
            log.debug("[交期预测] 校准查询失败，使用原始预测: {}", ce.getMessage());
        }
        return correctedMlDays;
    }

    /** 保存预测日志（数据飞轮），失败不影响响应 */
    private void savePredictionLog(ProductionOrder order, LocalDate today, long blendedMlDays,
                                   double velocity, long remaining, int confidence) {
        try {
            IntelligencePredictionLog plog = new IntelligencePredictionLog();
            plog.setPredictionId("PRED-" + java.util.UUID.randomUUID().toString()
                    .replace("-", "").substring(0, 16).toUpperCase());
            plog.setTenantId(UserContext.tenantId());
            plog.setOrderId(String.valueOf(order.getId()));
            plog.setOrderNo(order.getOrderNo());
            plog.setCurrentProgress(order.getProductionProgress());
            plog.setPredictedFinishTime(LocalDateTime.of(
                    today.plusDays(blendedMlDays), LocalTime.NOON));
            // 仅在扩展列已存在时写入，避免云端历史库缺列导致 insert 失败。
            if (hasPredictionLogExtraColumns()) {
                plog.setFactoryName(order.getFactoryName());
                plog.setDailyVelocity(velocity);
                plog.setRemainingQty(remaining);
            }
            plog.setConfidence(BigDecimal.valueOf(confidence).movePointLeft(2));
            plog.setAlgorithmVersion("rule_v3_ewma_trend");
            plog.setSampleCount(14);
            plog.setCreateTime(LocalDateTime.now());
            predictionLogMapper.insert(plog);
        } catch (Exception le) {
            log.warn("[交期预测] 保存预测日志失败（不影响响应）: {}", le.getMessage(), le);
        }
    }

    /** P80完工天数：基于180天内同一工厂的历史实际完工记录，取80百分位 */
    private OptionalDouble calcP80Days(Long tenantId, String factoryName) {
        if (factoryName == null || factoryName.isBlank()) return OptionalDouble.empty();
        try {
            QueryWrapper<IntelligencePredictionLog> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId).eq("factory_name", factoryName)
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
            log.debug("[交期预测] P80计算异常: {}", e.getMessage());
            return OptionalDouble.empty();
        }
    }

    /**
     * v3 智能混合速度预测：EWMA(指数加权) + 趋势检测 + 周末/节假日季节性加权
     *
     * <p>算法流程：
     * <ol>
     *   <li>拉取近 14 天（原 7 天）真实日产量序列</li>
     *   <li>计算 EWMA（α=0.33）— 越近的日期权重越大，平滑噪声</li>
     *   <li>检测线性趋势（最小二乘斜率）— 若产能显著提升/下降，外推到未来</li>
     *   <li>季节性修正：自动识别周末产能下降日，给予补偿系数</li>
     *   <li>混合产出：velocity = ewma * (1 + trendBoost) * seasonFactor</li>
     * </ol>
     *
     * <p>相比 v2 简单 WMA：避免极端单日抖动被过度放大，趋势性产能变化能被正确捕捉。
     */
    private double computeWeightedVelocity(String orderId) {
        LocalDateTime now = LocalDateTime.now();
        final int windowDays = 14;
        double[] dailyQty = new double[windowDays];
        boolean hasAnyData = false;

        // Step 1: 拉取近 14 天真实产量
        for (int i = 0; i < windowDays; i++) {
            LocalDateTime dayStart = now.minusDays(windowDays - i).toLocalDate().atStartOfDay();
            LocalDateTime dayEnd = dayStart.plusDays(1);

            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq("order_id", orderId)
              .eq("scan_result", "success")
              .ne("scan_type", "orchestration")
              .gt("quantity", 0)
              .between("scan_time", dayStart, dayEnd);
            long dayQty = scanRecordService.list(qw).stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
            dailyQty[i] = dayQty;
            if (dayQty > 0) hasAnyData = true;
        }

        if (!hasAnyData) return 0;

        // Step 2: EWMA 平滑 (α=0.33, 越近权重越大)
        final double alpha = 0.33;
        double ewma = 0;
        int firstValidIdx = -1;
        for (int i = 0; i < windowDays; i++) {
            if (dailyQty[i] > 0) {
                ewma = dailyQty[i];
                firstValidIdx = i;
                break;
            }
        }
        if (firstValidIdx < 0) return 0;

        for (int i = firstValidIdx + 1; i < windowDays; i++) {
            if (dailyQty[i] > 0) {
                ewma = alpha * dailyQty[i] + (1 - alpha) * ewma;
            } else {
                // 无扫码日不参与 EWMA 更新，但轻微衰减避免停滞高估
                ewma = ewma * 0.95;
            }
        }

        // Step 3: 趋势检测（最小二乘斜率，仅对非零数据点）
        int validDays = 0;
        double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (int i = 0; i < windowDays; i++) {
            if (dailyQty[i] > 0) {
                double x = i;
                double y = dailyQty[i];
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumX2 += x * x;
                validDays++;
            }
        }

        double trendBoost = 0;
        if (validDays >= 3) {
            double slope = (validDays * sumXY - sumX * sumY) / (validDays * sumX2 - sumX * sumX);
            // 归一化斜率：相对 ewma 的变化率
            if (ewma > 0) {
                double relativeSlope = slope / ewma;
                // 限制趋势修正范围在 ±25%，避免极端斜率导致不合理预测
                trendBoost = Math.max(-0.25, Math.min(0.25, relativeSlope * 3.0));
            }
        }

        // Step 4: 季节性修正（未来 7 天内周末日数占比）
        int weekendDays = 0;
        for (int i = 1; i <= 7; i++) {
            int dow = now.plusDays(i).getDayOfWeek().getValue();
            if (dow == 6 || dow == 7) weekendDays++;
        }
        double weekRatio = weekendDays / 7.0;
        // 假设周末产能约为平日 70%（服装行业通用基线）
        double seasonFactor = 1.0 - weekRatio * 0.30;

        // Step 5: 综合输出
        double velocity = ewma * (1 + trendBoost) * seasonFactor;
        if (velocity < 0) velocity = 0;

        log.debug("[交期预测V3] orderId={} ewma={:.1f} trend={:+.2f}% season={:.2f} finalVel={:.1f}",
                orderId, ewma, trendBoost * 100, seasonFactor, velocity);
        return velocity;
    }

    private int resolveTotal(ProductionOrder order) {
        if (order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0) {
            return order.getCuttingQuantity();
        }
        return order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
    }

    /**
     * 检测 prediction_log 扩展列是否齐全（factory_name/daily_velocity/remaining_qty）。
     * 只在首次调用时查询 INFORMATION_SCHEMA，结果缓存到内存，避免每次预测额外查询。
     */
    private boolean hasPredictionLogExtraColumns() {
        if (predictionLogExtraColumnsReady != null) {
            return predictionLogExtraColumnsReady;
        }
        schemaCheckLock.lock();
        try {
            if (predictionLogExtraColumnsReady != null) {
                return predictionLogExtraColumnsReady;
            }
            if (jdbcTemplate == null) {
                predictionLogExtraColumnsReady = false;
                return false;
            }
            try {
                Integer count = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                                + "WHERE TABLE_SCHEMA = DATABASE() "
                                + "AND TABLE_NAME = 't_intelligence_prediction_log' "
                                + "AND COLUMN_NAME IN ('factory_name','daily_velocity','remaining_qty')",
                        Integer.class);
                predictionLogExtraColumnsReady = count != null && count == 3;
            } catch (Exception e) {
                log.warn("[交期预测] 检测 prediction_log 扩展列失败，按兼容模式写入核心字段: {}", e.getMessage());
                predictionLogExtraColumnsReady = false;
            }
            return predictionLogExtraColumnsReady;
        } finally {
            schemaCheckLock.unlock();
        }
    }
}
