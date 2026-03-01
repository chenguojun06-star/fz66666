package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SmartAssignmentRequest;
import com.fashion.supplychain.intelligence.dto.SmartAssignmentResponse;
import com.fashion.supplychain.intelligence.dto.SmartAssignmentResponse.WorkerRecommendation;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 智能派工推荐引擎
 *
 * <p>基于过去30天扫码数据，对指定工序推荐最优工人：
 * <pre>
 *   评分 = 日均产量占比(40%) + 活跃天数占比(30%) + 稳定性(30%)
 *   稳定性 = 1 - (标准差 / 均值)，越稳定分越高
 * </pre>
 */
@Service
@Slf4j
public class SmartAssignmentOrchestrator {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public SmartAssignmentResponse recommend(SmartAssignmentRequest request) {
        SmartAssignmentResponse response = new SmartAssignmentResponse();
        if (request == null || request.getStageName() == null
                || request.getStageName().isBlank()) {
            return response;
        }

        response.setStageName(request.getStageName());
        Long tenantId = UserContext.tenantId();
        LocalDate today = LocalDate.now();
        LocalDateTime from = today.minusDays(30).atStartOfDay();
        LocalDateTime to = today.plusDays(1).atStartOfDay();

        // 查询该工序30天内所有成功扫码记录
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("scan_result", "success")
          .gt("quantity", 0)
          .ge("scan_time", from)
          .lt("scan_time", to)
          .and(w -> w.eq("progress_stage", request.getStageName())
                     .or().eq("process_name", request.getStageName()));

        List<ScanRecord> records = scanRecordMapper.selectList(qw);
        if (records.isEmpty()) return response;

        // 按工人分组
        Map<String, List<ScanRecord>> byWorker = records.stream()
                .filter(r -> r.getOperatorName() != null && !r.getOperatorName().isBlank())
                .collect(Collectors.groupingBy(ScanRecord::getOperatorName));

        // 计算工厂日均（基准线）
        double factoryAvg = calcFactoryDailyAvg(records);

        List<WorkerRecommendation> candidates = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byWorker.entrySet()) {
            WorkerRecommendation rec = evaluateWorker(
                    entry.getKey(), entry.getValue(), factoryAvg, today);
            if (rec != null) candidates.add(rec);
        }

        // 按评分降序
        candidates.sort(Comparator.comparingInt(WorkerRecommendation::getScore).reversed());

        // 最多返回10个推荐
        response.setRecommendations(
                candidates.subList(0, Math.min(10, candidates.size())));
        return response;
    }

    private WorkerRecommendation evaluateWorker(String name, List<ScanRecord> records,
            double factoryAvg, LocalDate today) {

        // 按天汇总产量
        Map<LocalDate, Long> dailyQty = records.stream()
                .filter(r -> r.getScanTime() != null)
                .collect(Collectors.groupingBy(
                        r -> r.getScanTime().toLocalDate(),
                        Collectors.summingLong(r -> r.getQuantity() != null ? r.getQuantity() : 0)));

        if (dailyQty.isEmpty()) return null;

        long totalQty = dailyQty.values().stream().mapToLong(Long::longValue).sum();
        int activeDays = dailyQty.size();
        double avgPerDay = (double) totalQty / activeDays;

        // 稳定性 = 1 - (stdDev / mean)
        double mean = avgPerDay;
        double stdDev = calcStdDev(new ArrayList<>(dailyQty.values()), mean);
        double stability = mean > 0 ? Math.max(0, 1.0 - stdDev / mean) : 0;

        // 综合评分（满分100）
        double productivityScore = factoryAvg > 0
                ? Math.min(1.0, avgPerDay / factoryAvg) : 0.5;
        double activityScore = Math.min(1.0, activeDays / 20.0); // 20天以上满分
        int score = (int) Math.round(
                productivityScore * 40 + activityScore * 30 + stability * 30);

        // 对比工厂均值
        int vsAvgPct = factoryAvg > 0
                ? (int) Math.round((avgPerDay - factoryAvg) / factoryAvg * 100) : 0;

        String level;
        if (score >= 80) level = "excellent";
        else if (score >= 60) level = "good";
        else level = "normal";

        // 最后活跃日
        LocalDate lastActive = dailyQty.keySet().stream()
                .max(LocalDate::compareTo).orElse(today);

        WorkerRecommendation rec = new WorkerRecommendation();
        rec.setOperatorName(name);
        rec.setScore(score);
        rec.setReason(buildReason(avgPerDay, activeDays, stability, vsAvgPct));
        rec.setAvgPerDay(Math.round(avgPerDay * 10.0) / 10.0);
        rec.setVsAvgPct(vsAvgPct);
        rec.setLevel(level);
        rec.setLastActiveDate(lastActive.format(DT_FMT));
        return rec;
    }

    private double calcFactoryDailyAvg(List<ScanRecord> allRecords) {
        Map<String, Map<LocalDate, Long>> workerDaily = allRecords.stream()
                .filter(r -> r.getOperatorName() != null && r.getScanTime() != null)
                .collect(Collectors.groupingBy(ScanRecord::getOperatorName,
                        Collectors.groupingBy(
                                r -> r.getScanTime().toLocalDate(),
                                Collectors.summingLong(r ->
                                        r.getQuantity() != null ? r.getQuantity() : 0))));

        List<Double> workerAvgs = new ArrayList<>();
        for (Map<LocalDate, Long> daily : workerDaily.values()) {
            double avg = daily.values().stream().mapToLong(Long::longValue)
                    .average().orElse(0);
            workerAvgs.add(avg);
        }
        return workerAvgs.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private String buildReason(double avgPerDay, int activeDays,
            double stability, int vsAvgPct) {
        String prod = vsAvgPct >= 20 ? "高产" : vsAvgPct >= -10 ? "稳定" : "待提升";
        String stab = stability >= 0.7 ? "产出稳定" : stability >= 0.4 ? "波动较小" : "波动较大";
        return String.format("日均 %.0f 件（%s工厂均值 %d%%），%d 天活跃，%s",
                avgPerDay, vsAvgPct >= 0 ? "高于" : "低于", Math.abs(vsAvgPct),
                activeDays, stab);
    }

    private double calcStdDev(List<Long> values, double mean) {
        if (values.size() < 2) return 0;
        double sumSq = values.stream()
                .mapToDouble(v -> Math.pow(v - mean, 2)).sum();
        return Math.sqrt(sumSq / values.size());
    }
}
