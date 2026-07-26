package com.fashion.supplychain.dashboard.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DashboardScanQueryHelper {

    private final ScanRecordService scanRecordService;
    private final DashboardCacheHelper cacheHelper;

    public DashboardScanQueryHelper(ScanRecordService scanRecordService, DashboardCacheHelper cacheHelper) {
        this.scanRecordService = scanRecordService;
        this.cacheHelper = cacheHelper;
    }

    /**
     * 扫码次数（按时间区间）
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long countScansBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return 0L;
        return scanRecordService.lambdaQuery()
                .eq(ScanRecord::getTenantId, tenantId)
                .between(ScanRecord::getScanTime, start, end)
                .ne(ScanRecord::getScanType, "orchestration")
                .count();
    }

    public List<ScanRecord> listRecentScans(int limit) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) {
            return Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return scanRecordService.lambdaQuery()
                .select(ScanRecord::getId, ScanRecord::getOrderNo, ScanRecord::getScanTime)
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getOperatorName, "system")
                .ne(ScanRecord::getScanType, "orchestration")
                .isNotNull(ScanRecord::getOperatorId)
                .and(w -> w
                        .isNull(ScanRecord::getRequestId)
                        .or()
                        .notLikeRight(ScanRecord::getRequestId, "ORDER_")
                )
                .and(w -> w
                        .isNull(ScanRecord::getRequestId)
                        .or()
                        .notLikeRight(ScanRecord::getRequestId, "ORCH_")
                )
                .orderByDesc(ScanRecord::getScanTime)
                .page(new Page<>(1, lim))
                .getRecords();
    }

    /**
     * 今日扫码数量合计
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long sumTodayScanQuantity() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return 0L;
        java.time.LocalDate today = java.time.LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, java.time.LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, java.time.LocalTime.MAX);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .eq("tenant_id", tenantId)
                .ge("scan_time", startOfDay)
                .le("scan_time", endOfDay)
                .ne("scan_type", "orchestration");
        return cacheHelper.extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }

    /**
     * 扫码总数量
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public long sumTotalScanQuantity() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return 0L;
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .eq("tenant_id", tenantId)
                .ne("scan_type", "orchestration");
        return cacheHelper.extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }

    /**
     * 每日扫码次数（30 天趋势）
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public List<Integer> getDailyScanCounts(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return Collections.nCopies(30, 0);
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COUNT(*) as total")
                .eq("tenant_id", tenantId)
                .ge("scan_time", start)
                .le("scan_time", end)
                .eq("scan_result", "success")
                .ne("operator_name", "system")
                .ne("scan_type", "orchestration")
                .isNotNull("operator_id")
                .isNotNull("scan_time")
                .groupBy("DATE(scan_time)");
        List<Map<String, Object>> rows = scanRecordService.getBaseMapper().selectMaps(qw);
        java.util.Map<String, Integer> dailyMap = new java.util.HashMap<>();
        for (Map<String, Object> row : rows) {
            String d = String.valueOf(row.get("d") != null ? row.get("d") : row.get("D"));
            long total = ((Number) row.getOrDefault("total", row.getOrDefault("TOTAL", 0))).longValue();
            dailyMap.put(d, (int) total);
        }
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyMap.getOrDefault(date, 0));
        }
        return result;
    }

    /**
     * 每日扫码数量（30 天趋势）
     * <p>
     * P0 修复（铁律4 多租户隔离）：必须按 tenant_id 过滤，防止跨租户统计
     */
    public List<Integer> getDailyScanQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return Collections.nCopies(30, 0);
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        if (tenantId == null) return Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .eq("tenant_id", tenantId)
                .ge("scan_time", start)
                .le("scan_time", end)
                .eq("scan_result", "success")
                .ne("operator_name", "system")
                .ne("scan_type", "orchestration")
                .isNotNull("operator_id")
                .isNotNull("scan_time")
                .groupBy("DATE(scan_time)");
        List<Map<String, Object>> rows = scanRecordService.getBaseMapper().selectMaps(qw);
        java.util.Map<String, Integer> dailyMap = new java.util.HashMap<>();
        for (Map<String, Object> row : rows) {
            String d = String.valueOf(row.get("d") != null ? row.get("d") : row.get("D"));
            long total = ((Number) row.getOrDefault("total", row.getOrDefault("TOTAL", 0))).longValue();
            dailyMap.put(d, (int) total);
        }
        List<Integer> result = new java.util.ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String date = start.plusDays(i).toLocalDate().toString();
            result.add(dailyMap.getOrDefault(date, 0));
        }
        return result;
    }
}
