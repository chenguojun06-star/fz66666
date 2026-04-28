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

    public long countScansBetween(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            return 0;
        }
        return scanRecordService.lambdaQuery()
                .between(ScanRecord::getScanTime, start, end)
                .ne(ScanRecord::getScanType, "orchestration")
                .count();
    }

    public List<ScanRecord> listRecentScans(int limit) {
        if (com.fashion.supplychain.common.UserContext.tenantId() == null) {
            return Collections.emptyList();
        }
        int lim = Math.max(1, limit);
        return scanRecordService.lambdaQuery()
                .select(ScanRecord::getId, ScanRecord::getOrderNo, ScanRecord::getScanTime)
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

    public long sumTodayScanQuantity() {
        java.time.LocalDate today = java.time.LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, java.time.LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, java.time.LocalTime.MAX);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .ge("scan_time", startOfDay)
                .le("scan_time", endOfDay)
                .ne("scan_type", "orchestration");
        return cacheHelper.extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }

    public long sumTotalScanQuantity() {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
                .ne("scan_type", "orchestration");
        return cacheHelper.extractLongScalar(scanRecordService.getBaseMapper().selectMaps(qw), "total");
    }

    public List<Integer> getDailyScanCounts(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COUNT(*) as total")
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

    public List<Integer> getDailyScanQuantities(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return Collections.nCopies(30, 0);
        QueryWrapper<ScanRecord> qw = new QueryWrapper<ScanRecord>()
                .select("DATE(scan_time) as d", "COALESCE(SUM(COALESCE(quantity, 0)), 0) as total")
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
