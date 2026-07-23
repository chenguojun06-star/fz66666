package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.entity.IntelligencePredictionLog;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Lazy
@Slf4j
public class MlDeliveryPredictionOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int SEQUENCE_LENGTH = 14;
    private static final int FORECAST_HORIZON = 7;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    @Autowired(required = false)
    private OnnxModelService onnxModelService;

    private volatile Boolean modelAvailable = null;

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

            double[] dailySequence = buildDailySequence(order.getId());

            if (countPositive(dailySequence) < 3) {
                resp.setRationale("数据不足，无法使用ML模型预测");
                resp.setConfidence(15);
                return resp;
            }

            if (isMlModelAvailable()) {
                return predictWithMlModel(resp, order, dailySequence, remaining);
            } else {
                return predictWithFallback(resp, order, dailySequence, remaining);
            }

        } catch (Exception e) {
            log.error("[ML交期预测] 异常（降级返回空数据）: {}", e.getMessage(), e);
            resp.setRationale("数据加载异常，请稍后重试");
        }
        return resp;
    }

    private boolean isMlModelAvailable() {
        if (modelAvailable != null) return modelAvailable;
        if (onnxModelService == null) {
            modelAvailable = false;
            return false;
        }
        try {
            modelAvailable = onnxModelService.isModelLoaded();
        } catch (Exception e) {
            log.warn("[ML预测] 模型检查失败: {}", e.getMessage());
            modelAvailable = false;
        }
        return modelAvailable;
    }

    private DeliveryPredictionResponse predictWithMlModel(DeliveryPredictionResponse resp,
                                                          ProductionOrder order,
                                                          double[] dailySequence,
                                                          long remaining) {
        try {
            double[] normalizedSeq = normalizeSequence(dailySequence);
            double[] forecast = onnxModelService.predict(normalizedSeq);
            double[] denormalized = denormalizeSequence(forecast, dailySequence);

            double avgVelocity = Arrays.stream(denormalized).average().orElse(0);
            if (avgVelocity <= 0) {
                return predictWithFallback(resp, order, dailySequence, remaining);
            }

            LocalDate today = LocalDate.now();
            long mlDays = Math.max(1, Math.round(remaining / avgVelocity));

            long calibratedDays = calibrateWithHistory(order, mlDays);
            long blendedDays = blendWithP80(order, calibratedDays);

            fillPredictionResponse(resp, today, mlDays, blendedDays, avgVelocity, remaining, 88);
            resp.setRationale(String.format("ML模型预测：基于近%d天产量序列，预测日均%.1f件，剩余%d件，预计%d~%d天完成",
                    SEQUENCE_LENGTH, avgVelocity, remaining, mlDays, (long) (mlDays * 1.3)));
            resp.setRationale(resp.getRationale() + "（Holt-Winters三阶指数平滑）");

            savePredictionLog(order, today, blendedDays, avgVelocity, remaining, 88, "ml_v1_holt_winters");
            return resp;

        } catch (Exception e) {
            log.warn("[ML预测] 模型推理失败，降级到规则算法: {}", e.getMessage());
            return predictWithFallback(resp, order, dailySequence, remaining);
        }
    }

    private DeliveryPredictionResponse predictWithFallback(DeliveryPredictionResponse resp,
                                                           ProductionOrder order,
                                                           double[] dailySequence,
                                                           long remaining) {
        double velocity = computeEwmaVelocity(dailySequence);
        if (velocity <= 0) {
            resp.setRationale("近14天无有效产量数据");
            resp.setConfidence(10);
            return resp;
        }

        LocalDate today = LocalDate.now();
        long optDays = Math.max(1, Math.round(remaining / (velocity * 1.2)));
        long mlDays = Math.max(1, Math.round(remaining / velocity));
        long pesDays = Math.max(1, Math.round(remaining / (velocity * 0.7)));

        long calibratedDays = calibrateWithHistory(order, mlDays);
        long blendedDays = blendWithP80(order, calibratedDays);

        fillPredictionResponse(resp, today, optDays, blendedDays, pesDays, velocity, remaining, 75);
        resp.setRationale(String.format("规则算法预测：EWMA日均%.1f件，剩余%d件，预计%d~%d天完成",
                velocity, remaining, optDays, pesDays));
        resp.setRationale(resp.getRationale() + "（EWMA规则降级）");

        savePredictionLog(order, today, blendedDays, velocity, remaining, 75, "rule_v4_ewma");
        return resp;
    }

    private double[] buildDailySequence(String orderId) {
        LocalDateTime now = LocalDateTime.now();
        double[] sequence = new double[SEQUENCE_LENGTH];
        for (int i = 0; i < SEQUENCE_LENGTH; i++) {
            LocalDateTime dayStart = now.minusDays(SEQUENCE_LENGTH - i).toLocalDate().atStartOfDay();
            LocalDateTime dayEnd = dayStart.plusDays(1);

            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq("order_id", orderId)
                    .eq("scan_result", "success")
                    .ne("scan_type", "orchestration")
                    .gt("quantity", 0)
                    .between("scan_time", dayStart, dayEnd);

            long dayQty = scanRecordService.list(qw).stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
            sequence[i] = dayQty;
        }
        return sequence;
    }

    private double[] normalizeSequence(double[] sequence) {
        double max = Arrays.stream(sequence).max().orElse(1);
        double min = Arrays.stream(sequence).filter(v -> v > 0).min().orElse(0);
        double range = max - min;
        if (range == 0) range = 1;
        double[] result = new double[sequence.length];
        for (int i = 0; i < sequence.length; i++) {
            result[i] = (sequence[i] - min) / range;
        }
        return result;
    }

    private double[] denormalizeSequence(double[] normalized, double[] original) {
        double max = Arrays.stream(original).max().orElse(1);
        double min = Arrays.stream(original).filter(v -> v > 0).min().orElse(0);
        double range = max - min;
        double[] result = new double[normalized.length];
        for (int i = 0; i < normalized.length; i++) {
            result[i] = normalized[i] * range + min;
        }
        return result;
    }

    private double computeEwmaVelocity(double[] sequence) {
        final double alpha = 0.33;
        double ewma = 0;
        int firstValidIdx = -1;
        for (int i = 0; i < sequence.length; i++) {
            if (sequence[i] > 0) {
                ewma = sequence[i];
                firstValidIdx = i;
                break;
            }
        }
        if (firstValidIdx < 0) return 0;

        for (int i = firstValidIdx + 1; i < sequence.length; i++) {
            if (sequence[i] > 0) {
                ewma = alpha * sequence[i] + (1 - alpha) * ewma;
            } else {
                ewma = ewma * 0.95;
            }
        }
        return ewma;
    }

    private long calibrateWithHistory(ProductionOrder order, long mlDays) {
        if (order.getFactoryName() == null || order.getFactoryName().isBlank()) {
            return mlDays;
        }
        try {
            Double avgBiasDays = predictionLogMapper.getAvgBiasDays(
                    UserContext.tenantId(), order.getFactoryName(), 3);
            if (avgBiasDays != null && Math.abs(avgBiasDays) <= 30) {
                long correction = Math.round(avgBiasDays);
                return Math.max(1, mlDays + correction);
            }
        } catch (Exception e) {
            log.debug("[校准] 查询失败: {}", e.getMessage());
        }
        return mlDays;
    }

    private long blendWithP80(ProductionOrder order, long calibratedDays) {
        OptionalDouble p80Opt = calcP80Days(UserContext.tenantId(), order.getFactoryName());
        if (p80Opt.isPresent()) {
            long p80Days = Math.round(p80Opt.getAsDouble());
            return Math.max(1, Math.round(calibratedDays * 0.6 + p80Days * 0.4));
        }
        return calibratedDays;
    }

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
            log.debug("[P80] 计算异常: {}", e.getMessage());
            return OptionalDouble.empty();
        }
    }

    private void fillPredictionResponse(DeliveryPredictionResponse resp, LocalDate today,
                                        long optDays, long mlDays, long pesDays,
                                        double velocity, long remaining, int confidence) {
        resp.setDailyVelocity(Math.round(velocity * 10.0) / 10.0);
        resp.setOptimisticDate(today.plusDays(optDays).format(DATE_FMT));
        resp.setMostLikelyDate(today.plusDays(mlDays).format(DATE_FMT));
        resp.setPessimisticDate(today.plusDays(pesDays).format(DATE_FMT));
        resp.setConfidence(confidence);
    }

    private void fillPredictionResponse(DeliveryPredictionResponse resp, LocalDate today,
                                        long mlDays, long blendedDays,
                                        double velocity, long remaining, int confidence) {
        resp.setDailyVelocity(Math.round(velocity * 10.0) / 10.0);
        resp.setOptimisticDate(today.plusDays(Math.max(1, (long) (mlDays * 0.7))).format(DATE_FMT));
        resp.setMostLikelyDate(today.plusDays(blendedDays).format(DATE_FMT));
        resp.setPessimisticDate(today.plusDays((long) (mlDays * 1.3)).format(DATE_FMT));
        resp.setConfidence(confidence);
    }

    private ProductionOrder loadOrder(String idStr) {
        ProductionOrder order = null;
        if (idStr.matches("\\d+")) {
            try {
                order = productionOrderService.getById(Long.parseLong(idStr));
            } catch (Exception e) {
                log.debug("ID解析失败: {}", e.getMessage());
            }
        }
        if (order == null) {
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", UserContext.tenantId())
                    .and(w -> w.eq("order_no", idStr)
                            .or().eq("order_no", "PO" + idStr)
                            .or().eq("order_no", idStr.replaceFirst("^(?i)PO", "")));
            order = productionOrderService.getOne(qw);
        }
        return order;
    }

    private void fillCompletedResponse(DeliveryPredictionResponse resp) {
        resp.setMostLikelyDate(LocalDate.now().format(DATE_FMT));
        resp.setOptimisticDate(LocalDate.now().format(DATE_FMT));
        resp.setPessimisticDate(LocalDate.now().format(DATE_FMT));
        resp.setDailyVelocity(0);
        resp.setLikelyDelayed(false);
        resp.setConfidence(95);
        resp.setRationale("订单已完成");
    }

    private long fillBaseInfo(DeliveryPredictionResponse resp, ProductionOrder order) {
        resp.setOrderId(order.getId());
        resp.setOrderNo(order.getOrderNo());
        int totalQty = order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0
                ? order.getCuttingQuantity()
                : (order.getOrderQuantity() != null ? order.getOrderQuantity() : 0);
        int completedQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        long remaining = Math.max(0, totalQty - completedQty);
        resp.setRemainingQty(remaining);
        if (order.getPlannedEndDate() != null) {
            resp.setPlannedDeadline(order.getPlannedEndDate().format(DATE_FMT));
        }
        return remaining;
    }

    private void savePredictionLog(ProductionOrder order, LocalDate today, long blendedMlDays,
                                   double velocity, long remaining, int confidence, String algorithmVersion) {
        try {
            IntelligencePredictionLog plog = new IntelligencePredictionLog();
            plog.setPredictionId("PRED-" + UUID.randomUUID().toString()
                    .replace("-", "").substring(0, 16).toUpperCase());
            plog.setTenantId(UserContext.tenantId());
            plog.setOrderId(String.valueOf(order.getId()));
            plog.setOrderNo(order.getOrderNo());
            plog.setCurrentProgress(order.getProductionProgress());
            plog.setPredictedFinishTime(LocalDateTime.of(today.plusDays(blendedMlDays), LocalTime.NOON));
            if (jdbcTemplate != null) {
                try {
                    Integer count = jdbcTemplate.queryForObject(
                            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                                    + "WHERE TABLE_SCHEMA = DATABASE() "
                                    + "AND TABLE_NAME = 't_intelligence_prediction_log' "
                                    + "AND COLUMN_NAME IN ('factory_name','daily_velocity','remaining_qty')",
                            Integer.class);
                    if (count != null && count == 3) {
                        plog.setFactoryName(order.getFactoryName());
                        plog.setDailyVelocity(velocity);
                        plog.setRemainingQty(remaining);
                    }
                } catch (Exception e) {
                    log.debug("[日志] 扩展列检查失败: {}", e.getMessage());
                }
            }
            plog.setConfidence(BigDecimal.valueOf(confidence).movePointLeft(2));
            plog.setAlgorithmVersion(algorithmVersion);
            plog.setSampleCount(SEQUENCE_LENGTH);
            plog.setCreateTime(LocalDateTime.now());
            predictionLogMapper.insert(plog);
        } catch (Exception e) {
            log.warn("[日志] 保存失败: {}", e.getMessage());
        }
    }

    private int countPositive(double[] arr) {
        int count = 0;
        for (double v : arr) {
            if (v > 0) count++;
        }
        return count;
    }
}