package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse.PulsePoint;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse.StagnantFactory;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 实时生产脉搏编排器 — 全工厂心跳监测
 *
 * <p>算法：查询最近2小时扫码记录，按10分钟分桶统计，
 * 生成时序脉搏图 + 识别停滞工厂（60分钟无扫码视为工序卡点）。
 */
@Service
@Slf4j
public class LivePulseOrchestrator {

    private static final int PULSE_WINDOW_MINUTES = 120;
    private static final int BUCKET_MINUTES = 10;
    /** 60分钟无扫码视为工序卡点（30分钟过于敏感，工人短休/换工序均会误报） */
    private static final int STAGNANT_THRESHOLD_MINUTES = 60;
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public LivePulseResponse pulse() {
        LivePulseResponse resp = new LivePulseResponse();
        try {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime windowStart = now.minusMinutes(PULSE_WINDOW_MINUTES);
        LocalDateTime todayStart = now.toLocalDate().atStartOfDay();

        List<ScanRecord> windowScans = queryScans(tenantId, factoryId, windowStart, now);
        List<ScanRecord> todayScans = queryScans(tenantId, factoryId, todayStart, now);

        Map<String, String> orderFactoryMap = buildOrderFactoryMap(tenantId, factoryId);

        resp.setTodayScanQty(todayScans.stream()
                .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum());
        resp.setActiveWorkers((int) windowScans.stream()
                .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count());
        resp.setActiveFactories((int) windowScans.stream()
                .map(r -> orderFactoryMap.getOrDefault(r.getOrderId(), ""))
                .filter(s -> !s.isEmpty()).distinct().count());

        long windowQty = windowScans.stream()
                .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
        resp.setScanRatePerHour(windowQty * 60.0 / PULSE_WINDOW_MINUTES);
        resp.setTimeline(buildTimeline(windowScans, windowStart));
        resp.setStagnantFactories(detectStagnant(todayScans, now, orderFactoryMap));
        resp.setFactoryActivity(buildFactoryActivity(todayScans, now, orderFactoryMap));
        } catch (Exception e) {
            log.error("[实时脉搏] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private List<PulsePoint> buildTimeline(List<ScanRecord> scans, LocalDateTime start) {
        List<PulsePoint> points = new ArrayList<>();
        int buckets = PULSE_WINDOW_MINUTES / BUCKET_MINUTES;
        for (int i = 0; i < buckets; i++) {
            LocalDateTime bs = start.plusMinutes((long) i * BUCKET_MINUTES);
            LocalDateTime be = bs.plusMinutes(BUCKET_MINUTES);
            List<ScanRecord> bucket = scans.stream()
                    .filter(r -> r.getScanTime() != null
                            && !r.getScanTime().isBefore(bs) && r.getScanTime().isBefore(be))
                    .collect(Collectors.toList());
            PulsePoint p = new PulsePoint();
            p.setTime(bs.format(HH_MM));
            p.setQuantity(bucket.stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum());
            p.setWorkers((int) bucket.stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count());
            points.add(p);
        }
        return points;
    }

    private List<StagnantFactory> detectStagnant(List<ScanRecord> todayScans,
            LocalDateTime now, Map<String, String> orderFactoryMap) {
        Map<String, List<ScanRecord>> byFactory = new HashMap<>();
        for (ScanRecord r : todayScans) {
            String factory = orderFactoryMap.getOrDefault(r.getOrderId(), "");
            if (!factory.isEmpty()) {
                byFactory.computeIfAbsent(factory, k -> new ArrayList<>()).add(r);
            }
        }

        // 收集所有有在制订单的工厂（排除 COMPLETED/CANCELLED/DRAFT）
        Set<String> activeOrderFactories = getActiveOrderFactories(UserContext.tenantId(), UserContext.factoryId());

        List<StagnantFactory> result = new ArrayList<>();

        // 场景1：今天有扫码但超过阈值时间没新扫码的工厂
        for (Map.Entry<String, List<ScanRecord>> entry : byFactory.entrySet()) {
            Optional<LocalDateTime> lastTime = entry.getValue().stream()
                    .map(ScanRecord::getScanTime).filter(Objects::nonNull).max(Comparator.naturalOrder());
            if (lastTime.isEmpty()) continue;
            long silent = Duration.between(lastTime.get(), now).toMinutes();
            if (silent >= STAGNANT_THRESHOLD_MINUTES) {
                StagnantFactory sf = new StagnantFactory();
                sf.setFactoryName(entry.getKey());
                sf.setMinutesSilent(silent);
                sf.setLastScanQty(entry.getValue().stream()
                        .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum());
                sf.setLastScanTime(lastTime.get().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
                result.add(sf);
            }
        }

        // 场景2：有在制订单但今天完全没扫码的工厂（最严重的停工）
        for (String factory : activeOrderFactories) {
            if (!byFactory.containsKey(factory)) {
                long minutesSinceStartOfDay = Duration.between(
                        now.toLocalDate().atStartOfDay(), now).toMinutes();
                StagnantFactory sf = new StagnantFactory();
                sf.setFactoryName(factory);
                sf.setMinutesSilent(minutesSinceStartOfDay);
                sf.setLastScanQty(0L);
                sf.setLastScanTime(null);
                result.add(sf);
            }
        }

        result.sort(Comparator.comparingLong(StagnantFactory::getMinutesSilent).reversed());
        return result;
    }

    /**
     * 查找所有有在制订单的工厂名称（排除已完成/已取消/草稿状态）
     */
    private Set<String> getActiveOrderFactories(Long tenantId, String factoryId) {
        TenantAssert.assertTenantContext();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("delete_flag", 0)
          .isNotNull("factory_name")
          .ne("factory_name", "")
          .notIn("status", "COMPLETED", "CANCELLED", "DRAFT")
          .select("factory_name");
        if (factoryId != null && !factoryId.isBlank()) {
            qw.eq("factory_id", factoryId);
        }
        return productionOrderService.list(qw).stream()
                .map(ProductionOrder::getFactoryName)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    private List<LivePulseResponse.FactoryActivity> buildFactoryActivity(
            List<ScanRecord> todayScans, LocalDateTime now, Map<String, String> orderFactoryMap) {
        Map<String, List<ScanRecord>> byFactory = new HashMap<>();
        for (ScanRecord r : todayScans) {
            String factory = orderFactoryMap.getOrDefault(r.getOrderId(), "");
            if (!factory.isEmpty()) {
                byFactory.computeIfAbsent(factory, k -> new ArrayList<>()).add(r);
            }
        }
        List<LivePulseResponse.FactoryActivity> result = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byFactory.entrySet()) {
            Optional<LocalDateTime> lastTime = entry.getValue().stream()
                    .map(ScanRecord::getScanTime).filter(Objects::nonNull).max(Comparator.naturalOrder());
            if (lastTime.isEmpty()) continue;
            long minutesSince = Duration.between(lastTime.get(), now).toMinutes();
            LivePulseResponse.FactoryActivity fa = new LivePulseResponse.FactoryActivity();
            fa.setFactoryName(entry.getKey());
            fa.setMinutesSinceLastScan(minutesSince);
            fa.setTodayQty(entry.getValue().stream()
                    .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum());
            fa.setTodayCount(entry.getValue().size());
            fa.setActive(minutesSince < STAGNANT_THRESHOLD_MINUTES);
            result.add(fa);
        }
        result.sort(Comparator.comparingLong(LivePulseResponse.FactoryActivity::getMinutesSinceLastScan));
        return result;
    }

    private Map<String, String> buildOrderFactoryMap(Long tenantId, String factoryId) {
        TenantAssert.assertTenantContext();
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("delete_flag", 0)
          .isNotNull("factory_name")
          .select("id", "factory_name");
        if (factoryId != null && !factoryId.isBlank()) {
            qw.eq("factory_id", factoryId);
        }
        return productionOrderService.list(qw).stream()
                .filter(o -> o.getFactoryName() != null)
                .collect(Collectors.toMap(o -> String.valueOf(o.getId()),
                        ProductionOrder::getFactoryName, (a, b) -> a));
    }

    private List<ScanRecord> queryScans(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        TenantAssert.assertTenantContext();
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                    .eq("scan_type", "production")
          .eq("scan_result", "success").gt("quantity", 0)
          .between("scan_time", start, end);
        if (factoryId != null && !factoryId.isBlank()) {
            qw.eq("factory_id", factoryId);
        }
        return scanRecordService.list(qw);
    }
}
