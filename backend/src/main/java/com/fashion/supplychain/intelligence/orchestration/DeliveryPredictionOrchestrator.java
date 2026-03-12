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
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
@Slf4j
public class DeliveryPredictionOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private IntelligencePredictionLogMapper predictionLogMapper;

    public DeliveryPredictionResponse predict(DeliveryPredictionRequest request) {
        DeliveryPredictionResponse resp = new DeliveryPredictionResponse();
        if (request == null || request.getOrderId() == null) {
            resp.setRationale("请提供订单ID");
            return resp;
        }

        try {
        String idStr = request.getOrderId().trim();
        ProductionOrder order = null;
        // 纯数字时先按主键查
        if (idStr.matches("\\d+")) {
            try { order = productionOrderService.getById(Long.parseLong(idStr)); } catch (Exception ignored) {}
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
        if (order == null) {
            resp.setRationale("订单不存在，请确认订单号");
            return resp;
        }

        resp.setOrderId(order.getId());
        resp.setOrderNo(order.getOrderNo());

        int totalQty = resolveTotal(order);
        int completedQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        long remaining = Math.max(0, totalQty - completedQty);
        resp.setRemainingQty(remaining);

        if (order.getPlannedEndDate() != null) {
            resp.setPlannedDeadline(order.getPlannedEndDate().format(DATE_FMT));
        }

        if (remaining == 0) {
            resp.setMostLikelyDate(LocalDate.now().format(DATE_FMT));
            resp.setOptimisticDate(LocalDate.now().format(DATE_FMT));
            resp.setPessimisticDate(LocalDate.now().format(DATE_FMT));
            resp.setDailyVelocity(0);
            resp.setLikelyDelayed(false);
            resp.setConfidence(95);
            resp.setRationale("订单已完成");
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
        long correctedMlDays = mlDays;
        if (order.getFactoryName() != null && !order.getFactoryName().isBlank()) {
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
        }

        resp.setOptimisticDate(today.plusDays(optDays).format(DATE_FMT));
        resp.setMostLikelyDate(today.plusDays(correctedMlDays).format(DATE_FMT));
        resp.setPessimisticDate(today.plusDays(pesDays).format(DATE_FMT));

        // 是否延期
        if (order.getPlannedEndDate() != null) {
            resp.setLikelyDelayed(today.plusDays(correctedMlDays).isAfter(
                    order.getPlannedEndDate().toLocalDate()));
        }

        // 置信度（数据量越多越高）
        int confidence = Math.min(90, 40 + (int) velocity);
        resp.setConfidence(confidence);
        resp.setRationale(String.format(
                "基于近7天加权日均产量 %.1f 件/天，剩余 %d 件，预计 %d ~ %d 天完成",
                velocity, remaining, optDays, pesDays));

        // ── 保存预测日志（数据飞轮）──
        try {
            IntelligencePredictionLog plog = new IntelligencePredictionLog();
            plog.setPredictionId("PRED-" + java.util.UUID.randomUUID().toString()
                    .replace("-", "").substring(0, 16).toUpperCase());
            plog.setTenantId(UserContext.tenantId());
            plog.setOrderId(String.valueOf(order.getId()));
            plog.setOrderNo(order.getOrderNo());
            plog.setFactoryName(order.getFactoryName());
            plog.setCurrentProgress(order.getProductionProgress());
            plog.setPredictedFinishTime(LocalDateTime.of(
                    today.plusDays(correctedMlDays), LocalTime.NOON));
            plog.setDailyVelocity(velocity);
            plog.setRemainingQty(remaining);
            plog.setConfidence(BigDecimal.valueOf(confidence).movePointLeft(2));
            plog.setAlgorithmVersion("rule_v2_calibrated");
            plog.setSampleCount(7);
            plog.setCreateTime(LocalDateTime.now());
            predictionLogMapper.insert(plog);
        } catch (Exception le) {
            log.warn("[交期预测] 保存预测日志失败（不影响响应）: {}", le.getMessage());
        }

        } catch (Exception e) {
            log.error("[交期预测] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
            resp.setRationale("数据加载异常，请稍后重试");
        }
        return resp;
    }

    private double computeWeightedVelocity(String orderId) {
        LocalDateTime now = LocalDateTime.now();
        int[] weights = {1, 2, 3, 4, 5, 6, 7};
        double weightedSum = 0;
        double weightTotal = 0;

        for (int i = 0; i < 7; i++) {
            LocalDateTime dayStart = now.minusDays(7 - i).toLocalDate().atStartOfDay();
            LocalDateTime dayEnd = dayStart.plusDays(1);

            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq("order_id", orderId)
              .eq("scan_result", "success")
              .gt("quantity", 0)
              .between("scan_time", dayStart, dayEnd);
            long dayQty = scanRecordService.list(qw).stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();

            weightedSum += dayQty * weights[i];
            weightTotal += weights[i];
        }

        return weightTotal > 0 ? weightedSum / weightTotal : 0;
    }

    private int resolveTotal(ProductionOrder order) {
        if (order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0) {
            return order.getCuttingQuantity();
        }
        return order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
    }
}
