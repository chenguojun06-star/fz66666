package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
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
        long mlDays = Math.max(1, Math.round(remaining / velocity));
        long pesDays = Math.max(1, Math.round(remaining / (velocity * 0.7)));

        resp.setOptimisticDate(today.plusDays(optDays).format(DATE_FMT));
        resp.setMostLikelyDate(today.plusDays(mlDays).format(DATE_FMT));
        resp.setPessimisticDate(today.plusDays(pesDays).format(DATE_FMT));

        // 是否延期
        if (order.getPlannedEndDate() != null) {
            resp.setLikelyDelayed(today.plusDays(mlDays).isAfter(
                    order.getPlannedEndDate().toLocalDate()));
        }

        // 置信度（数据量越多越高）
        resp.setConfidence(Math.min(90, 40 + (int) velocity));
        resp.setRationale(String.format(
                "基于近7天加权日均产量 %.1f 件/天，剩余 %d 件，预计 %d ~ %d 天完成",
                velocity, remaining, optDays, pesDays));

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
