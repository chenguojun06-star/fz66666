package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse.DeliveryRiskItem;
import com.fashion.supplychain.intelligence.entity.IntelligenceProcessStats;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 订单交期风险预警引擎
 *
 * <p>算法：对每个进行中订单，遍历所有剩余工序，
 * 用 ProcessStatsEngine 的历史统计预估剩余时间，汇总得到预测完工日期，
 * 再与计划交期比较得出风险等级。
 *
 * <pre>
 *   风险等级：
 *     overdue  — 计划交期已过
 *     danger   — 预测完工 > 计划交期（来不及）
 *     warning  — 预测完工日距交期 ≤ 3 天（紧张）
 *     safe     — 预测完工日距交期 > 3 天（安全）
 * </pre>
 */
@Service
@Slf4j
public class OrderDeliveryRiskOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final List<String> STAGE_ORDER = List.of(
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "质检", "入库");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    public DeliveryRiskResponse assess(DeliveryRiskRequest request) {
        DeliveryRiskResponse response = new DeliveryRiskResponse();
        Long tenantId = UserContext.tenantId();

        List<ProductionOrder> orders = loadOrders(tenantId, request);
        if (orders.isEmpty()) return response;

        List<String> orderIds = orders.stream()
                .map(ProductionOrder::getId).collect(Collectors.toList());
        List<Map<String, Object>> allAggs = scanRecordMapper.selectStageDoneAgg(orderIds);
        Map<String, Map<String, Integer>> orderStageMap = buildStageMap(allAggs);

        for (ProductionOrder order : orders) {
            try {
                DeliveryRiskItem item = assessSingleOrder(order,
                        orderStageMap.getOrDefault(order.getId(), Collections.emptyMap()),
                        tenantId);
                if (item != null) response.getOrders().add(item);
            } catch (Exception e) {
                log.warn("[交期预警] 订单 {} 分析失败: {}", order.getOrderNo(), e.getMessage());
            }
        }

        // 按风险等级排序：overdue > danger > warning > safe
        Map<String, Integer> riskOrder = Map.of(
                "overdue", 0, "danger", 1, "warning", 2, "safe", 3);
        response.getOrders().sort(Comparator.comparingInt(
                i -> riskOrder.getOrDefault(i.getRiskLevel(), 9)));

        return response;
    }

    private DeliveryRiskItem assessSingleOrder(ProductionOrder order,
            Map<String, Integer> stageDone, Long tenantId) {

        int totalQty = resolveTotalQty(order);
        if (totalQty <= 0) return null;

        LocalDate plannedEnd = parseDate(order.getPlannedEndDate());
        LocalDate today = LocalDate.now();

        // 计算各工序剩余分钟数汇总
        long totalRemainingMinutes = 0;
        for (String stage : STAGE_ORDER) {
            int done = stageDone.getOrDefault(stage, 0);
            int remaining = Math.max(0, totalQty - done);
            if (remaining == 0) continue;

            IntelligenceProcessStats stats = processStatsEngine.findBestStats(
                    tenantId, stage, "production");
            double minutesPerUnit = (stats != null && stats.getAvgMinutesPerUnit() != null
                    && stats.getAvgMinutesPerUnit().compareTo(BigDecimal.ZERO) > 0)
                    ? stats.getAvgMinutesPerUnit().doubleValue() : 8.0; // 默认8分钟/件

            totalRemainingMinutes += Math.round(minutesPerUnit * remaining);
        }

        // 预测完工日期（按每天8小时工作）
        long remainingDays = Math.max(1, totalRemainingMinutes / (8 * 60));
        LocalDate predictedEnd = today.plusDays(remainingDays);

        // 当前日均产量（过去7天扫码件数 / 7）
        int totalDone = stageDone.values().stream()
                .max(Integer::compareTo).orElse(0); // 取最大完成工序的件数
        int currentProgress = totalQty > 0
                ? Math.min(100, (int) Math.round(totalDone * 100.0 / totalQty)) : 0;

        // 计划剩余天数
        int daysLeft = plannedEnd != null
                ? (int) ChronoUnit.DAYS.between(today, plannedEnd) : 999;

        // 需要的日均产量
        int requiredDaily = (daysLeft > 0 && totalQty > totalDone)
                ? (int) Math.ceil((totalQty - totalDone) / (double) daysLeft) : 0;

        // 风险判定
        String riskLevel;
        String riskDesc;
        if (plannedEnd != null && today.isAfter(plannedEnd)) {
            riskLevel = "overdue";
            riskDesc = String.format("已逾期 %d 天", ChronoUnit.DAYS.between(plannedEnd, today));
        } else if (plannedEnd != null && predictedEnd.isAfter(plannedEnd)) {
            long overDays = ChronoUnit.DAYS.between(plannedEnd, predictedEnd);
            riskLevel = "danger";
            riskDesc = String.format("预计延期 %d 天（预测 %s 完工 vs 计划 %s）",
                    overDays, predictedEnd.format(DATE_FMT), plannedEnd.format(DATE_FMT));
        } else if (daysLeft <= 3 && daysLeft >= 0) {
            riskLevel = "warning";
            riskDesc = String.format("距交期仅剩 %d 天，进度 %d%%", daysLeft, currentProgress);
        } else {
            riskLevel = "safe";
            riskDesc = String.format("进度正常，预计 %s 前完工", predictedEnd.format(DATE_FMT));
        }

        DeliveryRiskItem item = new DeliveryRiskItem();
        item.setOrderId(order.getId());
        item.setOrderNo(order.getOrderNo());
        item.setStyleNo(order.getStyleNo());
        item.setFactoryName(order.getFactoryName());
        item.setPlannedEndDate(plannedEnd != null ? plannedEnd.format(DATE_FMT) : null);
        item.setPredictedEndDate(predictedEnd.format(DATE_FMT));
        item.setRiskLevel(riskLevel);
        item.setDaysLeft(daysLeft);
        item.setPredictedDaysNeeded((int) remainingDays);
        item.setCurrentProgress(currentProgress);
        item.setRequiredDailyOutput(requiredDaily);
        item.setRiskDescription(riskDesc);
        return item;
    }

    // ── 辅助方法 ──────────────────────────────────────────────────────

    private List<ProductionOrder> loadOrders(Long tenantId, DeliveryRiskRequest request) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .in("status", "IN_PROGRESS", "PENDING");
        if (request != null && StringUtils.hasText(request.getOrderId())) {
            qw.eq("id", request.getOrderId());
        }
        return productionOrderService.list(qw);
    }

    private Map<String, Map<String, Integer>> buildStageMap(List<Map<String, Object>> aggs) {
        Map<String, Map<String, Integer>> result = new HashMap<>();
        if (aggs == null) return result;
        for (Map<String, Object> row : aggs) {
            String orderId = Objects.toString(row.get("orderId"), "");
            String stage = Objects.toString(row.get("stageName"), "");
            int done = row.get("doneQuantity") != null
                    ? Integer.parseInt(row.get("doneQuantity").toString()) : 0;
            result.computeIfAbsent(orderId, k -> new HashMap<>())
                    .merge(stage, done, Integer::sum);
        }
        return result;
    }

    private int resolveTotalQty(ProductionOrder order) {
        if (order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0)
            return order.getCuttingQuantity();
        return order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
    }

    private LocalDate parseDate(Object dateObj) {
        if (dateObj == null) return null;
        try {
            if (dateObj instanceof LocalDate) return (LocalDate) dateObj;
            if (dateObj instanceof LocalDateTime) return ((LocalDateTime) dateObj).toLocalDate();
            return LocalDate.parse(dateObj.toString().substring(0, 10), DATE_FMT);
        } catch (Exception e) {
            return null;
        }
    }
}
