package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.WorkerProfileRequest;
import com.fashion.supplychain.intelligence.dto.WorkerProfileResponse;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工人效率画像编排器
 * <p>
 * 统计指定工人在一段时间内各工序的日均完成件数，并与同期工厂均值对比，
 * 输出 excellent / good / normal / below 四级评定。
 * </p>
 */
@Service
@Slf4j
public class WorkerProfileOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DT_FMT   = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    /**
     * 获取工人效率画像
     */
    public WorkerProfileResponse getProfile(WorkerProfileRequest request) {
        if (request == null || request.getOperatorName() == null || request.getOperatorName().isBlank()) {
            WorkerProfileResponse empty = new WorkerProfileResponse();
            empty.setStages(Collections.emptyList());
            return empty;
        }

        Long tenantId = UserContext.tenantId();
        LocalDate dateTo   = parseDateOrDefault(request.getDateTo(),   LocalDate.now());
        LocalDate dateFrom = parseDateOrDefault(request.getDateFrom(), dateTo.minusDays(29));

        LocalDateTime from = dateFrom.atStartOfDay();
        LocalDateTime to   = dateTo.plusDays(1).atStartOfDay();

        // ①查询该工人的扫码记录（默认30天）
        List<ScanRecord> workerRecords = queryRecords(tenantId, request.getOperatorName(), from, to);

        // 若30天内无记录，自动扩展到90天（仅在未指定日期时自动扩展）
        int dateDays;
        if (workerRecords.isEmpty() && request.getDateFrom() == null && request.getDateTo() == null) {
            LocalDate extFrom = dateTo.minusDays(89);
            workerRecords = queryRecords(tenantId, request.getOperatorName(),
                    extFrom.atStartOfDay(), to);
            if (!workerRecords.isEmpty()) {
                from = extFrom.atStartOfDay();
                dateDays = 90;
            } else {
                dateDays = 30;
            }
        } else {
            dateDays = (int) (dateTo.toEpochDay() - dateFrom.toEpochDay() + 1);
        }

        // ②查询同期所有工人的扫码记录（用于计算工厂均值）
        List<ScanRecord> allRecords = queryAllRecords(tenantId, from, to);

        // ③计算工厂各工序均值（operator+stage → avgPerDay）
        Map<String, Double> factoryStageAvg = calcFactoryStageAvg(allRecords);

        // ④按工序聚合该工人数据
        Map<String, List<ScanRecord>> byStage = workerRecords.stream()
                .filter(r -> r.getProgressStage() != null && !r.getProgressStage().isBlank())
                .collect(Collectors.groupingBy(ScanRecord::getProgressStage));

        List<WorkerProfileResponse.StageProfile> stages = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byStage.entrySet()) {
            String stageName = entry.getKey();
            List<ScanRecord> recs = entry.getValue();

            long totalQty = recs.stream().mapToLong(r -> r.getQuantity() == null ? 0 : r.getQuantity()).sum();
            if (totalQty == 0) continue;

            // 活跃天数 = 有记录的不同日期数
            long activeDays = recs.stream()
                    .filter(r -> r.getScanTime() != null)
                    .map(r -> r.getScanTime().toLocalDate())
                    .distinct()
                    .count();
            if (activeDays == 0) activeDays = 1;

            double avgPerDay = Math.round((double) totalQty / activeDays * 10.0) / 10.0;

            // 与工厂均值比较
            Double factoryAvg = factoryStageAvg.get(stageName);
            double vsFactoryAvgPct = 0.0;
            String level = "normal";
            if (factoryAvg != null && factoryAvg > 0) {
                vsFactoryAvgPct = Math.round((avgPerDay - factoryAvg) / factoryAvg * 1000.0) / 10.0;
                double ratio = avgPerDay / factoryAvg;
                if (ratio >= 1.3) level = "excellent";
                else if (ratio >= 0.9) level = "good";
                else if (ratio >= 0.7) level = "normal";
                else level = "below";
            }

            WorkerProfileResponse.StageProfile sp = new WorkerProfileResponse.StageProfile();
            sp.setStageName(stageName);
            sp.setTotalQty(totalQty);
            sp.setActiveDays((int) activeDays);
            sp.setAvgPerDay(avgPerDay);
            sp.setVsFactoryAvgPct(vsFactoryAvgPct);
            sp.setLevel(level);
            stages.add(sp);
        }

        // 按总件数降序
        stages.sort(Comparator.comparingLong(WorkerProfileResponse.StageProfile::getTotalQty).reversed());

        // 最后扫码时间（优先从查询范围内取，若范围内无记录则全局查一次兜底）
        String lastScanTime = workerRecords.stream()
                .filter(r -> r.getScanTime() != null)
                .map(ScanRecord::getScanTime)
                .max(Comparator.naturalOrder())
                .map(t -> t.format(DT_FMT))
                .orElseGet(() -> queryLastScanTime(tenantId, request.getOperatorName()));

        long totalQty = workerRecords.stream()
                .mapToLong(r -> r.getQuantity() == null ? 0 : r.getQuantity())
                .sum();

        WorkerProfileResponse resp = new WorkerProfileResponse();
        resp.setOperatorName(request.getOperatorName());
        resp.setStages(stages);
        resp.setTotalQty(totalQty);
        resp.setLastScanTime(lastScanTime);
        resp.setDateDays(dateDays);
        return resp;
    }

    // ── 私有方法 ──────────────────────────────────────────────────────────

    private List<ScanRecord> queryRecords(Long tenantId, String operatorName,
                                           LocalDateTime from, LocalDateTime to) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("scan_result", "success")
          .gt("quantity", 0)
          .eq(tenantId != null, "tenant_id", tenantId)
          .eq("operator_name", operatorName)
          .ge("scan_time", from)
          .lt("scan_time", to);
        List<ScanRecord> result = scanRecordMapper.selectList(qw);
        log.debug("[WorkerProfile] 工人={}, 记录数={}", operatorName, result.size());
        return result;
    }

    /**
     * 查询工人全局最近一次成功扫码时间（不限日期，用于90天内也无活动时的兜底显示）
     */
    private String queryLastScanTime(Long tenantId, String operatorName) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("scan_result", "success")
          .gt("quantity", 0)
          .eq(tenantId != null, "tenant_id", tenantId)
          .eq("operator_name", operatorName)
          .orderByDesc("scan_time")
          .last("LIMIT 1");
        List<ScanRecord> result = scanRecordMapper.selectList(qw);
        if (result.isEmpty() || result.get(0).getScanTime() == null) {
            return null;
        }
        return result.get(0).getScanTime().format(DT_FMT);
    }

    private List<ScanRecord> queryAllRecords(Long tenantId, LocalDateTime from, LocalDateTime to) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq("scan_result", "success")
          .gt("quantity", 0)
          .eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", from)
          .lt("scan_time", to);
        return scanRecordMapper.selectList(qw);
    }

    /**
     * 计算工厂各工序均值：先按（operator, stage）聚合各自的 avgPerDay，再对同一 stage 取均值
     */
    private Map<String, Double> calcFactoryStageAvg(List<ScanRecord> allRecords) {
        // operator+stage → list of records
        Map<String, Map<String, List<ScanRecord>>> byOperatorAndStage = allRecords.stream()
                .filter(r -> r.getProgressStage() != null && !r.getProgressStage().isBlank()
                          && r.getOperatorName() != null)
                .collect(Collectors.groupingBy(
                        ScanRecord::getOperatorName,
                        Collectors.groupingBy(ScanRecord::getProgressStage)
                ));

        // stage → list<operatorAvgPerDay>
        Map<String, List<Double>> stageOperatorAvgs = new HashMap<>();
        for (Map.Entry<String, Map<String, List<ScanRecord>>> opEntry : byOperatorAndStage.entrySet()) {
            for (Map.Entry<String, List<ScanRecord>> stageEntry : opEntry.getValue().entrySet()) {
                String stage = stageEntry.getKey();
                List<ScanRecord> recs = stageEntry.getValue();
                long qty = recs.stream().mapToLong(r -> r.getQuantity() == null ? 0 : r.getQuantity()).sum();
                long days = recs.stream()
                        .filter(r -> r.getScanTime() != null)
                        .map(r -> r.getScanTime().toLocalDate())
                        .distinct().count();
                if (days == 0) days = 1;
                double avg = (double) qty / days;
                stageOperatorAvgs.computeIfAbsent(stage, k -> new ArrayList<>()).add(avg);
            }
        }

        // 每个 stage 的全厂均值
        Map<String, Double> factoryAvg = new HashMap<>();
        for (Map.Entry<String, List<Double>> e : stageOperatorAvgs.entrySet()) {
            double avg = e.getValue().stream().mapToDouble(Double::doubleValue).average().orElse(0);
            factoryAvg.put(e.getKey(), avg);
        }
        return factoryAvg;
    }

    private LocalDate parseDateOrDefault(String dateStr, LocalDate defaultVal) {
        if (dateStr == null || dateStr.isBlank()) return defaultVal;
        try {
            return LocalDate.parse(dateStr, DATE_FMT);
        } catch (Exception e) {
            return defaultVal;
        }
    }
}
