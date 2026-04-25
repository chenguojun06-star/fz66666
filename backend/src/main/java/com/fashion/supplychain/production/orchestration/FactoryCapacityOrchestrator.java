package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.Data;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 工厂产能雷达编排器
 * <p>
 * 功能：按工厂汇总当前进行中的生产订单，输出：订单数、总件数、高风险数、已逾期数
 * 高风险定义：距截止日期 ≤ 7 天 且 生产进度 < 70%
 * 仅返回属于当前租户、非软删除、非已完成的订单
 * </p>
 */
@Service
public class FactoryCapacityOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(FactoryCapacityOrchestrator.class);

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private FactoryService factoryService;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    private static final String CACHE_KEY_PREFIX = "factory_capacity:";
    private static final long CACHE_TTL_MINUTES = 5;

    /** 高风险预警：距截止日期不超过多少天 */
    private static final int AT_RISK_DAYS = 7;
    /** 高风险预警：进度低于多少 */
    private static final int AT_RISK_PROGRESS = 70;

    @Data
    public static class FactoryCapacityItem {
        private String factoryName;
        private int totalOrders;
        private int totalQuantity;
        private int atRiskCount;
        private int overdueCount;
        private int deliveryOnTimeRate;
        private int activeWorkers;
        private double avgDailyOutput;
        private int estimatedCompletionDays;
        private int matchScore;
        private String capacitySource;
    }

    /**
     * 查询当前租户的工厂产能分布
     *
     * @return 按工厂分组的产能列表，按订单数降序排列
     */
    public List<FactoryCapacityItem> getFactoryCapacity() {
        Long tenantId = UserContext.tenantId();

        if (stringRedisTemplate != null && tenantId != null) {
            try {
                String cacheKey = CACHE_KEY_PREFIX + tenantId;
                String cached = stringRedisTemplate.opsForValue().get(cacheKey);
                if (cached != null) {
                    com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                    return om.readValue(cached, om.getTypeFactory().constructCollectionType(List.class, FactoryCapacityItem.class));
                }
            } catch (Exception e) {
                log.debug("[工厂产能] 缓存读取失败，降级直查: {}", e.getMessage());
            }
        }

        LocalDateTime now = LocalDateTime.now();

        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .notIn("status", OrderStatusConstants.TERMINAL_STATUSES)
          .eq("delete_flag", 0)
          .isNotNull("factory_name")
          .ne("factory_name", "");
        List<ProductionOrder> orders = productionOrderService.list(qw);

        Map<String, List<ProductionOrder>> grouped = orders.stream()
            .collect(Collectors.groupingBy(o ->
                o.getFactoryName() == null ? "未指定工厂" : o.getFactoryName().trim()
            ));

        List<FactoryCapacityItem> result = buildCapacityItems(grouped, now);

        fillDeliveryOnTimeRate(result, tenantId, now);

        fillScanBasedCapacity(orders, result, now);

        fillDailyCapacityFallback(result, tenantId);

        calculateMatchScore(result);

        result.sort(Comparator.comparingInt(FactoryCapacityItem::getMatchScore).reversed());

        if (stringRedisTemplate != null && tenantId != null) {
            try {
                String cacheKey = CACHE_KEY_PREFIX + tenantId;
                com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                stringRedisTemplate.opsForValue().set(cacheKey, om.writeValueAsString(result), CACHE_TTL_MINUTES, TimeUnit.MINUTES);
            } catch (Exception e) {
                log.debug("[工厂产能] 缓存写入失败: {}", e.getMessage());
            }
        }

        return result;
    }

    private List<FactoryCapacityItem> buildCapacityItems(Map<String, List<ProductionOrder>> grouped, LocalDateTime now) {
        List<FactoryCapacityItem> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : grouped.entrySet()) {
            List<ProductionOrder> group = entry.getValue();
            FactoryCapacityItem item = new FactoryCapacityItem();
            item.setFactoryName(entry.getKey());
            item.setTotalOrders(group.size());
            item.setTotalQuantity(group.stream()
                .mapToInt(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity())
                .sum());
            item.setOverdueCount((int) group.stream()
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .count());
            item.setAtRiskCount((int) group.stream()
                .filter(o -> isAtRisk(o, now))
                .count());
            result.add(item);
        }
        return result;
    }

    private void fillDeliveryOnTimeRate(List<FactoryCapacityItem> result, Long tenantId, LocalDateTime now) {
        LocalDateTime yearAgo = now.minusDays(365);
        QueryWrapper<ProductionOrder> doneQw = new QueryWrapper<>();
        doneQw.eq("tenant_id", tenantId)
              .eq("status", "completed")
              .eq("delete_flag", 0)
              .isNotNull("factory_name")
              .ne("factory_name", "")
              .isNotNull("actual_end_date")
              .isNotNull("planned_end_date")
              .ge("actual_end_date", yearAgo);
        List<ProductionOrder> completedOrders = productionOrderService.list(doneQw);

        Map<String, long[]> onTimeStats = new HashMap<>();
        for (ProductionOrder o : completedOrders) {
            String fn = o.getFactoryName().trim();
            onTimeStats.computeIfAbsent(fn, k -> new long[]{0, 0});
            onTimeStats.get(fn)[0]++;
            if (!o.getActualEndDate().isAfter(o.getPlannedEndDate())) {
                onTimeStats.get(fn)[1]++;
            }
        }

        for (FactoryCapacityItem item : result) {
            long[] stats = onTimeStats.get(item.getFactoryName());
            if (stats == null || stats[0] == 0) {
                item.setDeliveryOnTimeRate(-1);
            } else {
                item.setDeliveryOnTimeRate((int) Math.round(stats[1] * 100.0 / stats[0]));
            }
        }
    }

    private void fillDailyCapacityFallback(List<FactoryCapacityItem> result, Long tenantId) {
        if (tenantId == null) return;
        try {
            QueryWrapper<Factory> fqw = new QueryWrapper<>();
            fqw.eq("tenant_id", tenantId);
            List<Factory> factories = factoryService.list(fqw);
            Map<String, Factory> factoryByName = factories.stream()
                .filter(f -> f.getFactoryName() != null)
                .collect(Collectors.toMap(Factory::getFactoryName, f -> f, (a, b) -> a));

            for (FactoryCapacityItem item : result) {
                if (item.getAvgDailyOutput() > 0) {
                    item.setCapacitySource("real");
                    continue;
                }
                Factory f = factoryByName.get(item.getFactoryName());
                if (f != null && f.getDailyCapacity() != null && f.getDailyCapacity() > 0 && f.getDailyCapacity() != 500) {
                    item.setAvgDailyOutput(f.getDailyCapacity().doubleValue());
                    item.setCapacitySource("configured");
                    if (item.getTotalQuantity() > 0) {
                        item.setEstimatedCompletionDays((int) Math.ceil(item.getTotalQuantity() / f.getDailyCapacity().doubleValue()));
                    }
                } else {
                    item.setCapacitySource(item.getActiveWorkers() > 0 ? "real" : "none");
                }
            }
        } catch (Exception e) {
            log.warn("[工厂产能] 日产能fallback查询失败: {}", e.getMessage());
        }
    }

    private void calculateMatchScore(List<FactoryCapacityItem> result) {
        for (FactoryCapacityItem item : result) {
            int capacityScore = calcCapacityScore(item);
            int onTimeScore = calcOnTimeScore(item);
            int loadScore = calcLoadScore(item);
            int qualityScore = calcQualityScore(item);
            item.setMatchScore(Math.min(100, capacityScore + onTimeScore + loadScore + qualityScore));
        }
    }

    private int calcCapacityScore(FactoryCapacityItem item) {
        if (item.getAvgDailyOutput() <= 0) return 5;
        double ratio = item.getTotalQuantity() > 0
            ? Math.min(1.0, item.getAvgDailyOutput() * 30.0 / item.getTotalQuantity())
            : 1.0;
        return (int) (ratio * 40);
    }

    private int calcOnTimeScore(FactoryCapacityItem item) {
        if (item.getDeliveryOnTimeRate() < 0) return 18;
        return (int) (item.getDeliveryOnTimeRate() / 100.0 * 30);
    }

    private int calcLoadScore(FactoryCapacityItem item) {
        if (item.getTotalOrders() == 0) return 20;
        int overdueRatio = item.getOverdueCount() * 100 / Math.max(1, item.getTotalOrders());
        return Math.max(0, 20 - overdueRatio);
    }

    private int calcQualityScore(FactoryCapacityItem item) {
        if (item.getActiveWorkers() <= 0 && item.getAvgDailyOutput() <= 0) return 3;
        if (item.getActiveWorkers() >= 5) return 10;
        if (item.getActiveWorkers() >= 2) return 7;
        return 5;
    }

    /**
     * 从近30天扫码记录中提取：活跃工人数、日均产量、预计完工天数
     */
    private void fillScanBasedCapacity(List<ProductionOrder> inProgressOrders,
                                       List<FactoryCapacityItem> items,
                                       LocalDateTime now) {
        if (inProgressOrders.isEmpty()) return;

        // orderId → factoryName 映射
        Map<String, String> orderToFactory = new HashMap<>();
        for (ProductionOrder o : inProgressOrders) {
            String fn = o.getFactoryName() == null ? "未指定工厂" : o.getFactoryName().trim();
            orderToFactory.put(o.getId(), fn);
        }

        try {
            LocalDateTime thirtyDaysAgo = now.minusDays(30);
            QueryWrapper<ScanRecord> scanQw = new QueryWrapper<>();
            scanQw.in("order_id", orderToFactory.keySet())
                  .eq("scan_result", "success")
                  .ge("scan_time", thirtyDaysAgo)
                  .select("operator_id", "quantity", "scan_time", "order_id");
            List<ScanRecord> recentScans = scanRecordService.list(scanQw);

            // 按工厂分组
            Map<String, List<ScanRecord>> scansByFactory = recentScans.stream()
                .filter(r -> orderToFactory.containsKey(r.getOrderId()))
                .collect(Collectors.groupingBy(r -> orderToFactory.get(r.getOrderId())));

            for (FactoryCapacityItem item : items) {
                List<ScanRecord> scans = scansByFactory.getOrDefault(item.getFactoryName(), Collections.emptyList());
                if (scans.isEmpty()) {
                    item.setEstimatedCompletionDays(-1);
                    continue;
                }

                // 活跃工人数 = 不同操作员ID数
                long workers = scans.stream()
                    .map(ScanRecord::getOperatorId)
                    .filter(Objects::nonNull)
                    .distinct().count();
                item.setActiveWorkers((int) workers);

                // 活跃天数 = 有记录的不同日期数
                long activeDays = scans.stream()
                    .filter(r -> r.getScanTime() != null)
                    .map(r -> r.getScanTime().toLocalDate())
                    .distinct().count();
                if (activeDays == 0) activeDays = 1;

                // 日均产量
                long totalScanQty = scans.stream()
                    .mapToLong(r -> r.getQuantity() == null ? 0 : r.getQuantity())
                    .sum();
                double avgDaily = Math.round(totalScanQty * 10.0 / activeDays) / 10.0;
                item.setAvgDailyOutput(avgDaily);

                // 预计完工天数 = 在制总件数 / 日均产量
                if (avgDaily > 0) {
                    item.setEstimatedCompletionDays((int) Math.ceil(item.getTotalQuantity() / avgDaily));
                } else {
                    item.setEstimatedCompletionDays(-1);
                }
            }
        } catch (Exception e) {
            log.warn("[工厂产能] 扫码统计查询失败，降级跳过: {}", e.getMessage());
            for (FactoryCapacityItem item : items) {
                item.setEstimatedCompletionDays(-1);
            }
        }
    }

    private boolean isAtRisk(ProductionOrder o, LocalDateTime now) {
        if (o.getPlannedEndDate() == null) return false;
        // 已逾期不再重复计入高风险
        if (o.getPlannedEndDate().isBefore(now)) return false;
        long daysLeft = java.time.temporal.ChronoUnit.DAYS.between(now, o.getPlannedEndDate());
        int progress = o.getProductionProgress() == null ? 0 : o.getProductionProgress();
        return daysLeft <= AT_RISK_DAYS && progress < AT_RISK_PROGRESS;
    }
}
