package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse.AnomalyItem;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 异常行为检测引擎
 *
 * <p>检测维度：
 * <ul>
 *   <li>output_spike — 工人今日产量远超历史均值（z-score ≥ 2.5）</li>
 *   <li>quality_spike — 今日失败扫码率远超历史均值</li>
 *   <li>idle_worker — 连续7天以上活跃工人突然3天无扫码</li>
 *   <li>night_scan — 非工作时间（22:00-06:00）的扫码记录</li>
 * </ul>
 */
@Service
@Slf4j
public class AnomalyDetectionOrchestrator {

    /** z-score 阈值：超过则判定为异常 */
    private static final double Z_THRESHOLD = 2.5;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public AnomalyDetectionResponse detect() {
        AnomalyDetectionResponse response = new AnomalyDetectionResponse();
        Long tenantId = UserContext.tenantId();
        LocalDate today = LocalDate.now();

        // 查询今日所有成功扫码记录
        List<ScanRecord> todayRecords = queryRecords(tenantId,
                today.atStartOfDay(), today.plusDays(1).atStartOfDay(), null);

        // 查询过去30天历史记录（用于计算均值和标准差）
        List<ScanRecord> histRecords = queryRecords(tenantId,
                today.minusDays(30).atStartOfDay(), today.atStartOfDay(), null);

        int checked = 0;
        checked += detectOutputSpikes(todayRecords, histRecords, response);
        checked += detectNightScans(todayRecords, response);
        checked += detectQualitySpikes(tenantId, today, response);
        checked += detectIdleWorkers(tenantId, today, histRecords, todayRecords, response);

        response.setTotalChecked(checked);
        response.getAnomalies().sort(Comparator.comparing(
                a -> "critical".equals(a.getSeverity()) ? 0
                   : "warning".equals(a.getSeverity()) ? 1 : 2));
        return response;
    }

    // ── 维度①：产量异常飙升 ──────────────────────────────────────────

    private int detectOutputSpikes(List<ScanRecord> todayRecords,
            List<ScanRecord> histRecords, AnomalyDetectionResponse response) {

        // 按工人汇总今日产量
        Map<String, Long> todayByWorker = todayRecords.stream()
                .filter(r -> r.getOperatorName() != null)
                .collect(Collectors.groupingBy(ScanRecord::getOperatorName,
                        Collectors.summingLong(r -> r.getQuantity() != null ? r.getQuantity() : 0)));

        // 按工人+日期汇总历史日均产量
        Map<String, List<Long>> histDailyByWorker = new HashMap<>();
        histRecords.stream()
                .filter(r -> r.getOperatorName() != null && r.getScanTime() != null)
                .collect(Collectors.groupingBy(
                        r -> r.getOperatorName() + "|" + r.getScanTime().toLocalDate()))
                .forEach((key, recs) -> {
                    String worker = key.split("\\|")[0];
                    long dayTotal = recs.stream()
                            .mapToLong(r -> r.getQuantity() != null ? r.getQuantity() : 0).sum();
                    histDailyByWorker.computeIfAbsent(worker, k -> new ArrayList<>()).add(dayTotal);
                });

        for (Map.Entry<String, Long> entry : todayByWorker.entrySet()) {
            String worker = entry.getKey();
            long todayQty = entry.getValue();
            List<Long> hist = histDailyByWorker.getOrDefault(worker, Collections.emptyList());
            if (hist.size() < 5) continue; // 样本太少不做判定

            double mean = hist.stream().mapToLong(Long::longValue).average().orElse(0);
            double std = calcStdDev(hist, mean);
            if (std < 1) continue;

            double z = (todayQty - mean) / std;
            if (z >= Z_THRESHOLD) {
                AnomalyItem item = new AnomalyItem();
                item.setType("output_spike");
                item.setSeverity(z >= 4.0 ? "critical" : "warning");
                item.setTitle("产量异常飙升");
                item.setDescription(String.format(
                        "%s 今日产量 %d 件，历史日均 %.0f 件（偏差 %.1f 倍标准差）",
                        worker, todayQty, mean, z));
                item.setTargetName(worker);
                item.setTodayValue(todayQty);
                item.setHistoryAvg(mean);
                item.setDeviationRatio(Math.round(z * 10.0) / 10.0);
                response.getAnomalies().add(item);
            }
        }
        return todayByWorker.size();
    }

    // ── 维度②：夜间扫码 ─────────────────────────────────────────────

    private int detectNightScans(List<ScanRecord> todayRecords,
            AnomalyDetectionResponse response) {
        List<ScanRecord> nightScans = todayRecords.stream()
                .filter(r -> r.getScanTime() != null)
                .filter(r -> {
                    int hour = r.getScanTime().getHour();
                    return hour >= 22 || hour < 6;
                })
                .collect(Collectors.toList());

        if (!nightScans.isEmpty()) {
            // 按工人分组
            Map<String, Long> byWorker = nightScans.stream()
                    .filter(r -> r.getOperatorName() != null)
                    .collect(Collectors.groupingBy(ScanRecord::getOperatorName, Collectors.counting()));

            for (Map.Entry<String, Long> entry : byWorker.entrySet()) {
                AnomalyItem item = new AnomalyItem();
                item.setType("night_scan");
                item.setSeverity("info");
                item.setTitle("非工作时间扫码");
                item.setDescription(String.format(
                        "%s 在非工作时间（22:00-06:00）有 %d 条扫码记录",
                        entry.getKey(), entry.getValue()));
                item.setTargetName(entry.getKey());
                item.setTodayValue(entry.getValue());
                response.getAnomalies().add(item);
            }
        }
        return nightScans.size();
    }

    // ── 维度③：质量异常飙升（工厂级 Z-score 统计检测，≥2.0 警告 / ≥3.0 严重）──

    private int detectQualitySpikes(Long tenantId, LocalDate today,
            AnomalyDetectionResponse response) {

        // 查询30天全部记录（含成功+失败），按工厂分组
        List<ScanRecord> histAll = queryRecordsByResult(tenantId,
                today.minusDays(30).atStartOfDay(), today.plusDays(1).atStartOfDay(), null);

        if (histAll.size() < 20) return 0; // 样本太少

        // 按 (工人, 日期) → 统计 fail 数、total 数 → 得到每日失败率时间序列
        Map<String, Map<LocalDate, long[]>> factoryDailyStats = new HashMap<>();
        for (ScanRecord r : histAll) {
            if (r.getScanTime() == null) continue;
            String factory = r.getOperatorName() != null ? r.getOperatorName() : "__global__";
            LocalDate day = r.getScanTime().toLocalDate();
            factoryDailyStats
                .computeIfAbsent(factory, k -> new HashMap<>())
                .computeIfAbsent(day, k -> new long[]{0, 0});
            long[] cnt = factoryDailyStats.get(factory).get(day);
            cnt[1]++; // total
            if ("fail".equals(r.getScanResult())) cnt[0]++; // fail
        }

        int checked = 0;
        for (Map.Entry<String, Map<LocalDate, long[]>> factoryEntry : factoryDailyStats.entrySet()) {
            String factory = factoryEntry.getKey();
            Map<LocalDate, long[]> dailyStats = factoryEntry.getValue();

            // 仅取历史日（不含今天），构建失败率时间序列
            List<Double> histRates = new ArrayList<>();
            double todayFailRate = -1;
            long[] todayCounts = dailyStats.get(today);
            if (todayCounts != null && todayCounts[1] >= 5) {
                todayFailRate = (double) todayCounts[0] / todayCounts[1];
            }
            for (Map.Entry<LocalDate, long[]> dayEntry : dailyStats.entrySet()) {
                if (dayEntry.getKey().equals(today)) continue;
                long[] cnt = dayEntry.getValue();
                if (cnt[1] >= 3) histRates.add((double) cnt[0] / cnt[1]);
            }

            if (todayFailRate < 0 || histRates.size() < 5) { checked++; continue; }

            double mean = histRates.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double std = calcStdDevDouble(histRates, mean);
            if (std < 0.001) { checked++; continue; } // 历史数据过于稳定，std≈0不做判定

            double z = (todayFailRate - mean) / std;
            if (z >= 2.0) {
                AnomalyItem item = new AnomalyItem();
                item.setType("quality_spike");
                item.setSeverity(z >= 3.0 ? "critical" : "warning");
                String factoryLabel = "__global__".equals(factory) ? "全局" : factory;
                item.setTitle("质量异常飙升");
                item.setDescription(String.format(
                        "%s 今日扫码失败率 %.1f%%，历史均值 %.1f%%（Z-score %.1f，显著超出统计基线）",
                        factoryLabel, todayFailRate * 100, mean * 100, z));
                item.setTargetName(factoryLabel);
                item.setTodayValue(Math.round(todayFailRate * 1000.0) / 10.0);
                item.setHistoryAvg(Math.round(mean * 1000.0) / 10.0);
                item.setDeviationRatio(Math.round(z * 10.0) / 10.0);
                response.getAnomalies().add(item);
            }
            checked++;
        }
        return checked;
    }

    // ── 维度④：活跃工人突然消失 ──────────────────────────────────────

    private int detectIdleWorkers(Long tenantId, LocalDate today,
            List<ScanRecord> histRecords, List<ScanRecord> todayRecords,
            AnomalyDetectionResponse response) {

        // 过去30天活跃天数≥7天的工人
        Map<String, Set<LocalDate>> workerActiveDays = new HashMap<>();
        histRecords.stream()
                .filter(r -> r.getOperatorName() != null && r.getScanTime() != null)
                .forEach(r -> workerActiveDays
                        .computeIfAbsent(r.getOperatorName(), k -> new HashSet<>())
                        .add(r.getScanTime().toLocalDate()));

        Set<String> todayActive = todayRecords.stream()
                .filter(r -> r.getOperatorName() != null)
                .map(ScanRecord::getOperatorName)
                .collect(Collectors.toSet());

        int checked = 0;
        for (Map.Entry<String, Set<LocalDate>> entry : workerActiveDays.entrySet()) {
            if (entry.getValue().size() < 7) continue; // 非活跃工人不检测
            checked++;

            String worker = entry.getKey();
            if (todayActive.contains(worker)) continue; // 今天有扫码

            // 最后活跃日
            LocalDate lastActive = entry.getValue().stream()
                    .max(LocalDate::compareTo).orElse(today.minusDays(30));
            long idleDays = java.time.temporal.ChronoUnit.DAYS.between(lastActive, today);

            if (idleDays >= 3) {
                AnomalyItem item = new AnomalyItem();
                item.setType("idle_worker");
                item.setSeverity(idleDays >= 7 ? "warning" : "info");
                item.setTitle("活跃工人长期未扫码");
                item.setDescription(String.format(
                        "%s 已连续 %d 天未扫码（过去30天活跃 %d 天）",
                        worker, idleDays, entry.getValue().size()));
                item.setTargetName(worker);
                item.setTodayValue(idleDays);
                item.setHistoryAvg(entry.getValue().size());
                response.getAnomalies().add(item);
            }
        }
        return checked;
    }

    // ── 工具方法 ────────────────────────────────────────────────────

    private List<ScanRecord> queryRecords(Long tenantId,
            LocalDateTime from, LocalDateTime to, String scanResult) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("scan_result", "success")
          .gt("quantity", 0)
          .ge("scan_time", from)
          .lt("scan_time", to);
        return scanRecordMapper.selectList(qw);
    }

    private List<ScanRecord> queryRecordsByResult(Long tenantId,
            LocalDateTime from, LocalDateTime to, String result) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", from)
          .lt("scan_time", to);
        if (result != null) qw.eq("scan_result", result);
        return scanRecordMapper.selectList(qw);
    }

    private double calcStdDev(List<Long> values, double mean) {
        double sumSq = values.stream()
                .mapToDouble(v -> Math.pow(v - mean, 2)).sum();
        return Math.sqrt(sumSq / values.size());
    }

    private double calcStdDevDouble(List<Double> values, double mean) {
        double sumSq = values.stream().mapToDouble(v -> Math.pow(v - mean, 2)).sum();
        return Math.sqrt(sumSq / values.size());
    }
}
