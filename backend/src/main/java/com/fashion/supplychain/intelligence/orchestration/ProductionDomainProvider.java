package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.orchestration.FullDigitalTwinBuilder.DomainDataProvider;
import com.fashion.supplychain.intelligence.orchestration.FullDigitalTwinBuilder.ProductionDomain;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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
 * 生产域数字孪生数据提供者
 *
 * <p>核心能力：
 * <ol>
 *   <li>工厂负载热力图 — factoryName → {在制订单数、在制件数、产能利用率、负载等级}</li>
 *   <li>在制品工序分布 — process → {订单数、件数}（基于最近扫码记录）</li>
 *   <li>逾期/紧急订单统计 — 按交期分桶</li>
 *   <li>瓶颈工厂识别 — 负载率最高的工厂</li>
 * </ol>
 * </p>
 *
 * <p>多租户隔离（P0铁律4）：所有查询带 tenant_id WHERE</p>
 *
 * @author xiaoyun
 * @since 2026-08-08
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProductionDomainProvider implements DomainDataProvider {

    private final ProductionOrderService productionOrderService;
    private final ScanRecordService scanRecordService;
    private final FactoryService factoryService;

    private static final long STALLED_THRESHOLD_HOURS = 48;

    @Override
    public String domain() {
        return "production";
    }

    @Override
    public ProductionDomain buildProduction(Long tenantId) {
        if (tenantId == null) return null;
        try {
            List<ProductionOrder> allOrders = loadActiveOrders(tenantId);
            if (allOrders.isEmpty()) {
                return new ProductionDomain(0, 0, 0.0, 0L, 0, null, Collections.emptyMap());
            }

            int inProgress = (int) allOrders.stream()
                    .filter(o -> "production".equalsIgnoreCase(o.getStatus())
                            || "in_progress".equalsIgnoreCase(o.getStatus()))
                    .count();
            int overdue = (int) allOrders.stream().filter(this::isOverdue).count();
            double overdueRate = allOrders.size() > 0 ? (double) overdue * 100.0 / allOrders.size() : 0.0;
            long stalled = countStalledOrders(allOrders, tenantId);
            int qualityIssues = countQualityIssues(tenantId);
            String topOverdueFactory = findTopOverdueFactory(allOrders);

            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("factoryLoadHeatmap", buildFactoryLoadHeatmap(allOrders, tenantId));
            detail.put("wipProcessDistribution", buildWipProcessDistribution(tenantId));
            detail.put("deliveryBuckets", buildDeliveryBuckets(allOrders));
            detail.put("generatedAt", LocalDateTime.now().toString());

            return new ProductionDomain(inProgress, overdue, overdueRate, stalled, qualityIssues,
                    topOverdueFactory, detail);
        } catch (Exception e) {
            log.warn("[ProductionTwin] 构建生产域数字孪生失败: {}", e.getMessage(), e);
            return null;
        }
    }

    // ===== 数据加载 =====

    private List<ProductionOrder> loadActiveOrders(Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("delete_flag", 0)
                .in("status", "pending", "production", "delayed", "in_progress");
        return productionOrderService.list(qw);
    }

    // ===== 工厂负载热力图 =====

    /**
     * 构建工厂负载热力图：factoryName → {orderCount, totalQty, dailyCapacity, loadRate, level}
     * level: GREEN(<60%) / YELLOW(60-85%) / RED(>85%)
     */
    private Map<String, Object> buildFactoryLoadHeatmap(List<ProductionOrder> orders, Long tenantId) {
        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null && !o.getFactoryName().isBlank())
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

        Map<String, Integer> factoryDailyCap = loadFactoryDailyCapacity(tenantId);

        Map<String, Object> heatmap = new LinkedHashMap<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            String factoryName = entry.getKey();
            List<ProductionOrder> factoryOrders = entry.getValue();
            int orderCount = factoryOrders.size();
            int totalQty = factoryOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
                    .sum();
            int dailyCap = factoryDailyCap.getOrDefault(factoryName, 500);
            // 30天产能上限作为分母
            double loadRate = dailyCap > 0 ? Math.min(1.0, (double) totalQty / (dailyCap * 30.0)) : 0.0;
            String level = loadRate < 0.6 ? "GREEN" : loadRate < 0.85 ? "YELLOW" : "RED";

            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("orderCount", orderCount);
            cell.put("totalQty", totalQty);
            cell.put("dailyCapacity", dailyCap);
            cell.put("loadRate", Math.round(loadRate * 1000.0) / 10.0);
            cell.put("level", level);
            heatmap.put(factoryName, cell);
        }
        return heatmap;
    }

    private Map<String, Integer> loadFactoryDailyCapacity(Long tenantId) {
        QueryWrapper<Factory> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("delete_flag", 0).eq("status", "active");
        return factoryService.list(qw).stream()
                .filter(f -> f.getFactoryName() != null)
                .collect(Collectors.toMap(Factory::getFactoryName,
                        f -> f.getDailyCapacity() != null && f.getDailyCapacity() > 0 ? f.getDailyCapacity() : 500,
                        (a, b) -> a));
    }

    // ===== 在制品工序分布 =====

    /**
     * 构建在制品工序分布：process → {orderCount, totalQty}
     * 基于每个订单最近一次成功扫码记录的 processName
     */
    private Map<String, Object> buildWipProcessDistribution(Long tenantId) {
        // 取最近7天成功扫码记录，按订单分组取最新一条
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("scan_result", "success")
                .ne("scan_type", "orchestration")
                .ge("scan_time", since)
                .orderByDesc("scan_time");
        List<ScanRecord> recentScans = scanRecordService.list(qw);

        // orderId → latest processName
        Map<String, String> orderLatestProcess = new LinkedHashMap<>();
        for (ScanRecord s : recentScans) {
            if (s.getOrderId() == null) continue;
            String process = s.getProcessName() != null && !s.getProcessName().isBlank()
                    ? s.getProcessName() : (s.getProgressStage() != null ? s.getProgressStage() : "未知");
            orderLatestProcess.putIfAbsent(s.getOrderId(), process);
        }

        // process → orderCount
        Map<String, Long> processCount = orderLatestProcess.values().stream()
                .collect(Collectors.groupingBy(p -> p, Collectors.counting()));

        Map<String, Object> distribution = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : processCount.entrySet()) {
            Map<String, Object> bucket = new LinkedHashMap<>();
            bucket.put("orderCount", e.getValue());
            distribution.put(e.getKey(), bucket);
        }
        return distribution;
    }

    // ===== 交期分桶 =====

    private Map<String, Object> buildDeliveryBuckets(List<ProductionOrder> orders) {
        LocalDate today = LocalDate.now();
        long overdue = orders.stream().filter(o -> isOverdue(o, today)).count();
        long urgent3d = orders.stream().filter(o -> inRange(o, today, 0, 3)).count();
        long urgent7d = orders.stream().filter(o -> inRange(o, today, 4, 7)).count();
        long normal = orders.stream().filter(o -> inRange(o, today, 8, 30)).count();
        long future = orders.stream().filter(o -> inRange(o, today, 31, 3650)).count();

        Map<String, Object> buckets = new LinkedHashMap<>();
        buckets.put("overdue", overdue);
        buckets.put("urgent3d", urgent3d);
        buckets.put("urgent7d", urgent7d);
        buckets.put("normal", normal);
        buckets.put("future", future);
        return buckets;
    }

    private boolean inRange(ProductionOrder o, LocalDate today, int fromDays, int toDays) {
        if (o.getExpectedShipDate() == null && o.getPlannedEndDate() == null) return false;
        LocalDate deadline = o.getExpectedShipDate() != null
                ? o.getExpectedShipDate().toLocalDate()
                : o.getPlannedEndDate().toLocalDate();
        long days = java.time.temporal.ChronoUnit.DAYS.between(today, deadline);
        return days >= fromDays && days <= toDays;
    }

    // ===== 停滞/质量/瓶颈 =====

    private long countStalledOrders(List<ProductionOrder> orders, Long tenantId) {
        Set<String> recentOrderIds = loadRecentScannedOrderIds(tenantId);
        return orders.stream()
                .filter(o -> !recentOrderIds.contains(o.getId()))
                .filter(o -> "production".equalsIgnoreCase(o.getStatus())
                        || "delayed".equalsIgnoreCase(o.getStatus()))
                .count();
    }

    private Set<String> loadRecentScannedOrderIds(Long tenantId) {
        LocalDateTime threshold = LocalDateTime.now().minusHours(STALLED_THRESHOLD_HOURS);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("scan_result", "success")
                .ge("scan_time", threshold)
                .select("DISTINCT order_id");
        return scanRecordService.list(qw).stream()
                .map(ScanRecord::getOrderId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private int countQualityIssues(Long tenantId) {
        // 近7天质检不合格扫码次数
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("scan_type", "quality")
                .eq("scan_result", "fail")
                .ge("scan_time", since);
        try {
            return Math.toIntExact(scanRecordService.count(qw));
        } catch (Exception e) {
            return 0;
        }
    }

    private String findTopOverdueFactory(List<ProductionOrder> orders) {
        return orders.stream()
                .filter(o -> isOverdue(o, LocalDate.now()))
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);
    }

    private boolean isOverdue(ProductionOrder o) {
        return isOverdue(o, LocalDate.now());
    }

    private boolean isOverdue(ProductionOrder o, LocalDate today) {
        if (o.getExpectedShipDate() == null && o.getPlannedEndDate() == null) return false;
        LocalDate deadline = o.getExpectedShipDate() != null
                ? o.getExpectedShipDate().toLocalDate()
                : o.getPlannedEndDate().toLocalDate();
        return deadline.isBefore(today);
    }
}
