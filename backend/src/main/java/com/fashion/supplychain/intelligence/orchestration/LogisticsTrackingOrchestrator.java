package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 物流在途异常监控智能体
 *
 * 功能：
 * - 监控物流订单在途状态
 * - 识别异常订单（延迟/丢件/破损等）
 * - 提供异常预警和处理建议
 * - 追踪物流时效
 *
 * 核心价值：及时发现物流异常，减少客户投诉
 */
@Service
@Lazy
@Slf4j
public class LogisticsTrackingOrchestrator {

    /**
     * 获取在途物流异常监控报告
     */
    public LogisticsMonitorResponse monitorInTransitOrders() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 模拟获取物流数据（实际应对接物流API）
        List<LogisticsOrder> orders = fetchLogisticsOrders(tenantId);

        // 分析异常订单
        List<LogisticsAnomaly> anomalies = analyzeAnomalies(orders);

        // 计算统计数据
        LogisticsStats stats = calculateStats(orders, anomalies);

        // 生成处理建议
        List<LogisticsAction> actions = generateActions(anomalies);

        LogisticsMonitorResponse response = new LogisticsMonitorResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalOrders(orders.size());
        response.setInTransitCount((int) orders.stream().filter(o -> "IN_TRANSIT".equals(o.getStatus())).count());
        response.setDeliveredCount((int) orders.stream().filter(o -> "DELIVERED".equals(o.getStatus())).count());
        response.setAnomalies(anomalies);
        response.setStats(stats);
        response.setRecommendedActions(actions);

        log.info("[LogisticsTracking] 物流监控完成: total={}, anomalies={}, delayRate={}%",
                orders.size(), anomalies.size(), stats.getDelayRatePercent());

        return response;
    }

    /**
     * 获取指定订单的物流追踪信息
     */
    public LogisticsTrackingResponse trackOrder(String orderNo) {
        TenantAssert.assertTenantContext();

        // 模拟获取物流轨迹
        LogisticsTrackingResponse response = new LogisticsTrackingResponse();
        response.setOrderNo(orderNo);
        response.setTrackingNumber("SF1234567890");
        response.setCarrier("顺丰速运");
        response.setStatus("IN_TRANSIT");

        // 模拟轨迹
        List<TrackingEvent> events = new ArrayList<>();
        events.add(new TrackingEvent("2024-01-15 09:00:00", "快件已揽收", "深圳市南山区"));
        events.add(new TrackingEvent("2024-01-15 14:30:00", "快件已发出", "深圳集散中心"));
        events.add(new TrackingEvent("2024-01-16 08:00:00", "快件到达", "上海市分拨中心"));
        events.add(new TrackingEvent("2024-01-16 12:00:00", "快件派送中", "上海市浦东新区"));
        response.setTrackingEvents(events);

        // 预估送达时间
        response.setEstimatedDeliveryTime("2024-01-16 18:00:00");

        // 检查是否异常
        boolean isDelayed = checkDelay(events);
        response.setDelayed(isDelayed);
        if (isDelayed) {
            response.setDelayReason("预计送达时间已过，可能存在延迟");
        }

        return response;
    }

    /**
     * 获取高风险物流订单列表
     */
    public HighRiskLogisticsResponse getHighRiskOrders() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<LogisticsOrder> orders = fetchLogisticsOrders(tenantId);
        List<HighRiskOrder> highRiskOrders = new ArrayList<>();

        for (LogisticsOrder order : orders) {
            int riskScore = calculateRiskScore(order);
            if (riskScore >= 70) {
                HighRiskOrder riskOrder = new HighRiskOrder();
                riskOrder.setOrderNo(order.getOrderNo());
                riskOrder.setTrackingNumber(order.getTrackingNumber());
                riskOrder.setCarrier(order.getCarrier());
                riskOrder.setStatus(order.getStatus());
                riskOrder.setRiskScore(riskScore);
                riskOrder.setRiskLevel(riskScore >= 90 ? "CRITICAL" : "HIGH");
                riskOrder.setRiskReason(getRiskReason(order, riskScore));
                highRiskOrders.add(riskOrder);
            }
        }

        // 按风险评分排序
        highRiskOrders.sort((a, b) -> Integer.compare(b.getRiskScore(), a.getRiskScore()));

        HighRiskLogisticsResponse response = new HighRiskLogisticsResponse();
        response.setAnalysisDate(LocalDate.now());
        response.setTotalHighRisk(highRiskOrders.size());
        response.setHighRiskOrders(highRiskOrders);

        return response;
    }

    /**
     * 模拟获取物流订单数据
     */
    private List<LogisticsOrder> fetchLogisticsOrders(Long tenantId) {
        List<LogisticsOrder> orders = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        // 正常订单
        orders.add(createOrder("PO001", "SF1234567890", "顺丰速运", "IN_TRANSIT",
                now.minusDays(1), now.plusDays(1), null));
        orders.add(createOrder("PO002", "YT9876543210", "圆通速递", "IN_TRANSIT",
                now.minusDays(2), now.plusDays(2), null));
        orders.add(createOrder("PO003", "JD1122334455", "京东物流", "DELIVERED",
                now.minusDays(3), now.minusDays(1), null));

        // 延迟订单
        orders.add(createOrder("PO004", "ZT5566778899", "中通快递", "IN_TRANSIT",
                now.minusDays(5), now.minusDays(2), "延迟"));

        // 异常订单
        orders.add(createOrder("PO005", "EMS111222333", "EMS", "EXCEPTION",
                now.minusDays(7), null, "异常"));

        // 待揽收订单
        orders.add(createOrder("PO006", "DN444555666", "德邦物流", "PICKUP",
                now.minusDays(1), now.plusDays(3), null));

        return orders;
    }

    private LogisticsOrder createOrder(String orderNo, String trackingNo, String carrier, String status,
                                       LocalDateTime shippedAt, LocalDateTime estimatedDelivery, String remark) {
        LogisticsOrder order = new LogisticsOrder();
        order.setOrderNo(orderNo);
        order.setTrackingNumber(trackingNo);
        order.setCarrier(carrier);
        order.setStatus(status);
        order.setShippedAt(shippedAt);
        order.setEstimatedDelivery(estimatedDelivery);
        order.setRemark(remark);
        return order;
    }

    /**
     * 分析异常订单
     */
    private List<LogisticsAnomaly> analyzeAnomalies(List<LogisticsOrder> orders) {
        List<LogisticsAnomaly> anomalies = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (LogisticsOrder order : orders) {
            // 检查延迟
            if ("IN_TRANSIT".equals(order.getStatus()) && order.getEstimatedDelivery() != null) {
                if (now.isAfter(order.getEstimatedDelivery())) {
                    long delayHours = ChronoUnit.HOURS.between(order.getEstimatedDelivery(), now);
                    LogisticsAnomaly anomaly = new LogisticsAnomaly();
                    anomaly.setOrderNo(order.getOrderNo());
                    anomaly.setAnomalyType("DELAY");
                    anomaly.setSeverity(delayHours > 24 ? "HIGH" : delayHours > 12 ? "MEDIUM" : "LOW");
                    anomaly.setDescription(String.format("订单延迟%d小时", delayHours));
                    anomaly.setSuggestion("建议联系快递公司确认原因");
                    anomalies.add(anomaly);
                }
            }

            // 检查异常状态
            if ("EXCEPTION".equals(order.getStatus())) {
                LogisticsAnomaly anomaly = new LogisticsAnomaly();
                anomaly.setOrderNo(order.getOrderNo());
                anomaly.setAnomalyType("EXCEPTION");
                anomaly.setSeverity("HIGH");
                anomaly.setDescription("物流状态异常");
                anomaly.setSuggestion("建议立即联系快递公司处理");
                anomalies.add(anomaly);
            }

            // 检查长时间未更新
            if (order.getShippedAt() != null) {
                long hoursSinceUpdate = ChronoUnit.HOURS.between(order.getShippedAt(), now);
                if (hoursSinceUpdate > 48 && "IN_TRANSIT".equals(order.getStatus())) {
                    LogisticsAnomaly anomaly = new LogisticsAnomaly();
                    anomaly.setOrderNo(order.getOrderNo());
                    anomaly.setAnomalyType("STALE");
                    anomaly.setSeverity("MEDIUM");
                    anomaly.setDescription(String.format("物流信息%d小时未更新", hoursSinceUpdate));
                    anomaly.setSuggestion("建议联系快递公司确认包裹状态");
                    anomalies.add(anomaly);
                }
            }
        }

        return anomalies;
    }

    /**
     * 计算统计数据
     */
    private LogisticsStats calculateStats(List<LogisticsOrder> orders, List<LogisticsAnomaly> anomalies) {
        LogisticsStats stats = new LogisticsStats();

        long inTransit = orders.stream().filter(o -> "IN_TRANSIT".equals(o.getStatus())).count();
        long delivered = orders.stream().filter(o -> "DELIVERED".equals(o.getStatus())).count();
        long delayed = anomalies.stream().filter(a -> "DELAY".equals(a.getAnomalyType())).count();

        stats.setTotalOrders(orders.size());
        stats.setInTransitCount((int) inTransit);
        stats.setDeliveredCount((int) delivered);
        stats.setDelayedCount((int) delayed);
        stats.setDelayRatePercent(inTransit > 0 ? (int) (delayed * 100 / inTransit) : 0);
        stats.setOnTimeRatePercent(orders.size() > 0 ? (int) (delivered * 100 / orders.size()) : 0);

        return stats;
    }

    /**
     * 生成处理建议
     */
    private List<LogisticsAction> generateActions(List<LogisticsAnomaly> anomalies) {
        List<LogisticsAction> actions = new ArrayList<>();

        // 按严重程度分组
        long highSeverity = anomalies.stream().filter(a -> "HIGH".equals(a.getSeverity())).count();
        long mediumSeverity = anomalies.stream().filter(a -> "MEDIUM".equals(a.getSeverity())).count();

        if (highSeverity > 0) {
            LogisticsAction action = new LogisticsAction();
            action.setPriority("URGENT");
            action.setAction(String.format("立即处理%d个高优先级异常订单", highSeverity));
            action.setTarget(String.format("订单号：%s",
                    anomalies.stream()
                            .filter(a -> "HIGH".equals(a.getSeverity()))
                            .map(LogisticsAnomaly::getOrderNo)
                            .collect(Collectors.joining(", "))));
            actions.add(action);
        }

        if (mediumSeverity > 0) {
            LogisticsAction action = new LogisticsAction();
            action.setPriority("NORMAL");
            action.setAction(String.format("处理%d个中等优先级异常订单", mediumSeverity));
            action.setTarget("相关订单");
            actions.add(action);
        }

        return actions;
    }

    /**
     * 计算风险评分
     */
    private int calculateRiskScore(LogisticsOrder order) {
        int score = 0;

        if ("EXCEPTION".equals(order.getStatus())) {
            score += 40;
        }

        if (order.getEstimatedDelivery() != null) {
            long delayHours = ChronoUnit.HOURS.between(order.getEstimatedDelivery(), LocalDateTime.now());
            if (delayHours > 0) {
                score += Math.min((int) delayHours / 6, 30);
            }
        }

        if (order.getShippedAt() != null) {
            long hoursSinceUpdate = ChronoUnit.HOURS.between(order.getShippedAt(), LocalDateTime.now());
            if (hoursSinceUpdate > 24) {
                score += Math.min((int) (hoursSinceUpdate - 24) / 12, 30);
            }
        }

        return Math.min(score, 100);
    }

    private String getRiskReason(LogisticsOrder order, int riskScore) {
        if ("EXCEPTION".equals(order.getStatus())) {
            return "物流状态异常";
        }
        if (order.getEstimatedDelivery() != null && LocalDateTime.now().isAfter(order.getEstimatedDelivery())) {
            return "订单延迟";
        }
        return "物流信息长时间未更新";
    }

    private boolean checkDelay(List<TrackingEvent> events) {
        if (events.isEmpty()) return false;
        LocalDateTime lastEventTime = LocalDateTime.parse(events.get(events.size() - 1).getTime());
        return ChronoUnit.HOURS.between(lastEventTime, LocalDateTime.now()) > 24;
    }

    // ==================== 响应和内部类 ====================

    @Data
    public static class LogisticsMonitorResponse {
        private LocalDate analysisDate;
        private int totalOrders;
        private int inTransitCount;
        private int deliveredCount;
        private List<LogisticsAnomaly> anomalies;
        private LogisticsStats stats;
        private List<LogisticsAction> recommendedActions;
    }

    @Data
    public static class LogisticsOrder {
        private String orderNo;
        private String trackingNumber;
        private String carrier;
        private String status;
        private LocalDateTime shippedAt;
        private LocalDateTime estimatedDelivery;
        private String remark;
    }

    @Data
    public static class LogisticsAnomaly {
        private String orderNo;
        private String anomalyType;
        private String severity;
        private String description;
        private String suggestion;
    }

    @Data
    public static class LogisticsStats {
        private int totalOrders;
        private int inTransitCount;
        private int deliveredCount;
        private int delayedCount;
        private int delayRatePercent;
        private int onTimeRatePercent;
    }

    @Data
    public static class LogisticsAction {
        private String priority;
        private String action;
        private String target;
    }

    @Data
    public static class LogisticsTrackingResponse {
        private String orderNo;
        private String trackingNumber;
        private String carrier;
        private String status;
        private List<TrackingEvent> trackingEvents;
        private String estimatedDeliveryTime;
        private boolean isDelayed;
        private String delayReason;
    }

    @Data
    public static class TrackingEvent {
        private String time;
        private String status;
        private String location;

        public TrackingEvent(String time, String status, String location) {
            this.time = time;
            this.status = status;
            this.location = location;
        }
    }

    @Data
    public static class HighRiskLogisticsResponse {
        private LocalDate analysisDate;
        private int totalHighRisk;
        private List<HighRiskOrder> highRiskOrders;
    }

    @Data
    public static class HighRiskOrder {
        private String orderNo;
        private String trackingNumber;
        private String carrier;
        private String status;
        private int riskScore;
        private String riskLevel;
        private String riskReason;
    }
}
