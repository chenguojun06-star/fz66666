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

    private static final String CACHE_KEY_PREFIX = "factory_capacity:v2:";
    private static final long CACHE_TTL_MINUTES = 5;
    /** 历史评价统计窗口：近一年 */
    private static final int HISTORY_DAYS = 365;

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
        /** 历史评价：品质分（近一年扫码合格率，-1=无数据） */
        private double qualityScore = -1;
        /** 历史评价：完成率（%），-1=无数据 */
        private double completionRate = -1;
        /** 历史评价：综合评分（-1=无数据），按 准时率40%+品质40%+完成率20% */
        private double overallScore = -1;
        /** 历史评价：评级 S/A/B/C（综合评分≥90/75/60/60以下） */
        private String supplierTier;
        /** 历史评价：累计单量（近一年已完成 + 当前在制） */
        private int historyTotalOrders;
        /** 历史评价：已完成单数 */
        private int historyCompletedOrders;
        /** 历史评价：历史逾期单数 */
        private int historyOverdueOrders;
    }

    /**
     * 查询当前租户的工厂产能分布
     *
     * @return 按工厂分组的产能列表，按订单数降序排列
     */
    public List<FactoryCapacityItem> getFactoryCapacity() {
        // P2 修复（数据隔离）：工厂账号不应访问租户级全量产能数据
        // 旧逻辑无工厂账号判断，工厂账号调用会看到所有工厂的产能，存在跨工厂数据泄露
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return java.util.Collections.emptyList();
        }

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

        // 补齐无在制订单的外发工厂，保证历史评价数据可见
        fillMissingFactories(result, tenantId);

        // 填充历史评价：完成率/品质分/综合评分/评级（近一年口径）
        fillHistoricalEvaluation(result, tenantId, now);

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
            fqw.eq("tenant_id", tenantId).eq("delete_flag", 0);
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
                  .ne("scan_type", "orchestration")
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

    /**
     * 补齐无在制订单的外发工厂，确保历史评价数据可见。
     * 即使工厂当前没有进行中的订单，也保留在列表中（仅展示历史评价）。
     */
    private void fillMissingFactories(List<FactoryCapacityItem> result, Long tenantId) {
        if (tenantId == null) return;
        try {
            QueryWrapper<Factory> fqw = new QueryWrapper<>();
            fqw.eq("tenant_id", tenantId).eq("delete_flag", 0);
            List<Factory> factories = factoryService.list(fqw);

            Set<String> existing = result.stream()
                .map(FactoryCapacityItem::getFactoryName)
                .collect(Collectors.toSet());

            for (Factory f : factories) {
                String fn = f.getFactoryName();
                if (fn == null || fn.isBlank()) continue;
                fn = fn.trim();
                if (existing.contains(fn)) continue;
                // 仅补外发工厂或有评分数据的工厂
                boolean isOutsource = "EXTERNAL".equalsIgnoreCase(f.getFactoryType())
                        || "OUTSOURCE".equalsIgnoreCase(f.getSupplierType());
                boolean hasScore = f.getOverallScore() != null
                        || f.getQualityScore() != null
                        || f.getCompletionRate() != null;
                if (!isOutsource && !hasScore) continue;

                FactoryCapacityItem item = new FactoryCapacityItem();
                item.setFactoryName(fn);
                item.setTotalOrders(0);
                item.setTotalQuantity(0);
                item.setAtRiskCount(0);
                item.setOverdueCount(0);
                item.setDeliveryOnTimeRate(-1);
                item.setActiveWorkers(0);
                item.setAvgDailyOutput(0);
                item.setEstimatedCompletionDays(-1);
                item.setCapacitySource("none");
                if (f.getDailyCapacity() != null && f.getDailyCapacity() > 0 && f.getDailyCapacity() != 500) {
                    item.setAvgDailyOutput(f.getDailyCapacity().doubleValue());
                    item.setCapacitySource("configured");
                }
                result.add(item);
                existing.add(fn);
            }
        } catch (Exception e) {
            log.warn("[工厂产能] 补齐无在制工厂失败: {}", e.getMessage());
        }
    }

    /**
     * 填充历史评价数据（近一年口径）：
     * <ul>
     *   <li>完成率 = 已完成单数 / 近一年总单数（%），无单为 -1</li>
     *   <li>准时率 = 按期完工单数 / 有排期已完成单数（%），覆盖产能口径</li>
     *   <li>品质分 = 扫码成功条数 / 扫码总条数（%），无扫码取 t_factory.qualityScore，再无数据为 -1</li>
     *   <li>综合评分 = 准时率40% + 品质40% + 完成率20%（已有值才计算），否则取 t_factory.overallScore</li>
     *   <li>评级 = S/A/B/C（综合评分≥90/≥75/≥60/&lt;60）</li>
     * </ul>
     */
    private void fillHistoricalEvaluation(List<FactoryCapacityItem> result, Long tenantId, LocalDateTime now) {
        if (tenantId == null || result.isEmpty()) return;
        try {
            LocalDateTime yearAgo = now.minusDays(HISTORY_DAYS);
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("delete_flag", 0)
              .isNotNull("factory_name")
              .ne("factory_name", "")
              .ge("create_time", yearAgo);
            List<ProductionOrder> yearOrders = productionOrderService.list(qw);

            Map<String, List<ProductionOrder>> byFactory = yearOrders.stream()
                .collect(Collectors.groupingBy(o -> o.getFactoryName().trim()));

            Map<String, long[]> scanStats = buildHistoricalScanStats(tenantId, yearOrders);

            Map<String, Factory> factoryByName = loadFactoryByName(tenantId);

            for (FactoryCapacityItem item : result) {
                List<ProductionOrder> orders = byFactory.getOrDefault(item.getFactoryName(), Collections.emptyList());
                int total = orders.size();
                item.setHistoryTotalOrders(total);

                int completed = 0, overdue = 0, doneWithPlan = 0, onTimeCount = 0;
                long totalScan = 0, successScan = 0;
                for (ProductionOrder o : orders) {
                    if (isCompletedOrder(o)) {
                        completed++;
                        if (o.getActualEndDate() != null && o.getPlannedEndDate() != null) {
                            doneWithPlan++;
                            if (!o.getActualEndDate().isAfter(o.getPlannedEndDate())) {
                                onTimeCount++;
                            } else {
                                overdue++;
                            }
                        }
                    }
                    long[] st = scanStats.get(o.getId());
                    if (st != null) {
                        totalScan += st[0];
                        successScan += st[1];
                    }
                }
                item.setHistoryCompletedOrders(completed);
                item.setHistoryOverdueOrders(overdue);
                item.setCompletionRate(total > 0 ? round1(completed * 100.0 / total) : -1);

                // 准时率：覆盖为"有排期的已完成单"维度
                double onTimeRate = doneWithPlan > 0 ? round1(onTimeCount * 100.0 / doneWithPlan) : -1;
                if (onTimeRate >= 0) item.setDeliveryOnTimeRate((int) Math.round(onTimeRate));

                // 品质分
                double quality = totalScan > 0 ? round1(successScan * 100.0 / totalScan) : -1;
                item.setQualityScore(quality);

                Factory f = factoryByName.get(item.getFactoryName());

                // 无订单数据的评分兜底：取 t_factory 已持久化的评分
                if (total == 0 && f != null) {
                    if (quality < 0 && f.getQualityScore() != null) {
                        quality = f.getQualityScore().doubleValue();
                        item.setQualityScore(quality);
                    }
                    if (item.getDeliveryOnTimeRate() < 0 && f.getOnTimeDeliveryRate() != null) {
                        item.setDeliveryOnTimeRate(f.getOnTimeDeliveryRate().intValue());
                    }
                    if (item.getCompletionRate() < 0 && f.getCompletionRate() != null) {
                        item.setCompletionRate(f.getCompletionRate().doubleValue());
                    }
                }

                // 综合评分 + 评级
                double overall = -1;
                if (item.getDeliveryOnTimeRate() >= 0 && quality >= 0 && item.getCompletionRate() >= 0) {
                    overall = round1(item.getDeliveryOnTimeRate() * 0.4 + quality * 0.4 + item.getCompletionRate() * 0.2);
                } else if (f != null && f.getOverallScore() != null) {
                    overall = f.getOverallScore().doubleValue();
                }
                item.setOverallScore(overall);
                if (overall >= 0) {
                    item.setSupplierTier(toTier(overall));
                } else if (f != null) {
                    item.setSupplierTier(f.getSupplierTier());
                }
            }
        } catch (Exception e) {
            log.warn("[工厂产能] 历史评价统计失败: {}", e.getMessage());
        }
    }

    /** orderId → [totalScan, successScan]（近一年扫码记录） */
    private Map<String, long[]> buildHistoricalScanStats(Long tenantId, List<ProductionOrder> orders) {
        if (orders.isEmpty()) return Collections.emptyMap();
        Map<String, long[]> result = new HashMap<>();
        try {
            Set<String> orderIds = orders.stream()
                .map(ProductionOrder::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
            if (orderIds.isEmpty()) return result;
            QueryWrapper<ScanRecord> sq = new QueryWrapper<>();
            sq.eq("tenant_id", tenantId)
              .ne("scan_type", "orchestration")
              .in("order_id", orderIds)
              .select("order_id", "scan_result");
            List<ScanRecord> records = scanRecordService.list(sq);
            for (ScanRecord r : records) {
                if (r.getOrderId() == null) continue;
                result.computeIfAbsent(r.getOrderId(), k -> new long[]{0, 0});
                result.get(r.getOrderId())[0]++;
                if ("success".equalsIgnoreCase(r.getScanResult())) {
                    result.get(r.getOrderId())[1]++;
                }
            }
        } catch (Exception e) {
            log.warn("[工厂产能] 历史扫码质量统计失败: {}", e.getMessage());
        }
        return result;
    }

    private Map<String, Factory> loadFactoryByName(Long tenantId) {
        try {
            QueryWrapper<Factory> fqw = new QueryWrapper<>();
            fqw.eq("tenant_id", tenantId).eq("delete_flag", 0);
            List<Factory> factories = factoryService.list(fqw);
            return factories.stream()
                .filter(f -> f.getFactoryName() != null)
                .collect(Collectors.toMap(f -> f.getFactoryName().trim(), f -> f, (a, b) -> a));
        } catch (Exception e) {
            log.warn("[工厂产能] 加载工厂配置失败: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }

    private boolean isCompletedOrder(ProductionOrder o) {
        if (o.getStatus() == null) return false;
        String s = o.getStatus();
        return "completed".equalsIgnoreCase(s) || "warehoused".equalsIgnoreCase(s);
    }

    private double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private String toTier(double score) {
        if (score >= 90) return "S";
        if (score >= 75) return "A";
        if (score >= 60) return "B";
        return "C";
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
