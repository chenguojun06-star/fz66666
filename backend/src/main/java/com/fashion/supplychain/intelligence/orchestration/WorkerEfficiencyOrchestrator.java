package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.WorkerEfficiencyResponse;
import com.fashion.supplychain.intelligence.dto.WorkerEfficiencyResponse.WorkerEfficiency;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 工人效率画像编排器 — 五维雷达评分
 *
 * <p>算法：基于近30天扫码记录聚合每名操作员的五维得分：
 * <ul>
 *   <li>速度: 日均产量相对全局中位数的排名百分位</li>
 *   <li>质量: 成功扫码 / 总扫码 × 100</li>
 *   <li>稳定性: 100 - (日产量标准差 / 日均产量) × 50  ; clamp [0,100]</li>
 *   <li>出勤: 活跃天数 / 30 × 100</li>
 *   <li>多面手: 掌握工序数 / 系统总工序数 × 100</li>
 * </ul>
 */
@Service
@Slf4j
public class WorkerEfficiencyOrchestrator {

    private static final int EVAL_DAYS = 30;

    @Autowired
    private ScanRecordService scanRecordService;

    public WorkerEfficiencyResponse evaluate() {
        WorkerEfficiencyResponse resp = new WorkerEfficiencyResponse();
        try {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDate.now().minusDays(EVAL_DAYS).atStartOfDay();

        List<ScanRecord> records = queryRecords(tenantId, since);
        if (records.isEmpty()) {
            resp.setWorkers(Collections.emptyList());
            resp.setTotalEvaluated(0);
            return resp;
        }

        // 按操作员分组
        Map<String, List<ScanRecord>> byWorker = records.stream()
                .filter(r -> r.getOperatorId() != null)
                .collect(Collectors.groupingBy(ScanRecord::getOperatorId));

        Set<String> allProcesses = records.stream()
                .map(ScanRecord::getProcessName).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        int totalProcesses = Math.max(allProcesses.size(), 1);

        List<WorkerEfficiency> workers = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byWorker.entrySet()) {
            workers.add(buildProfile(entry.getKey(), entry.getValue(), totalProcesses));
        }

        // 速度分百分位校准
        calibrateSpeedScores(workers);

        workers.sort(Comparator.comparingInt(WorkerEfficiency::getOverallScore).reversed());
        resp.setWorkers(workers);
        resp.setTotalEvaluated(workers.size());
        if (!workers.isEmpty()) {
            resp.setTopWorkerName(workers.get(0).getWorkerName());
        }
        } catch (Exception e) {
            log.error("[员工效能] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private WorkerEfficiency buildProfile(String workerId,
            List<ScanRecord> records, int totalProcesses) {
        WorkerEfficiency we = new WorkerEfficiency();
        we.setWorkerId(workerId);
        we.setWorkerName(records.stream()
                .map(ScanRecord::getOperatorName).filter(Objects::nonNull)
                .findFirst().orElse(workerId));

        // 成功记录
        List<ScanRecord> success = records.stream()
                .filter(r -> "success".equals(r.getScanResult()) && r.getQuantity() != null && r.getQuantity() > 0)
                .collect(Collectors.toList());

        // 质量分
        we.setQualityScore(records.isEmpty() ? 0
                : Math.min(100, (int) (success.size() * 100.0 / records.size())));

        // 日产量 Map
        Map<LocalDate, Long> dailyQty = success.stream()
                .filter(r -> r.getScanTime() != null)
                .collect(Collectors.groupingBy(
                        r -> r.getScanTime().toLocalDate(),
                        Collectors.summingLong(ScanRecord::getQuantity)));

        double avgDaily = dailyQty.values().stream()
                .mapToLong(Long::longValue).average().orElse(0);
        we.setDailyAvgOutput(Math.round(avgDaily * 10.0) / 10.0);

        // 稳定性分
        double stddev = computeStddev(dailyQty.values());
        int stability = avgDaily > 0
                ? (int) Math.max(0, Math.min(100, 100 - (stddev / avgDaily) * 50))
                : 0;
        we.setStabilityScore(stability);

        // 出勤分
        we.setAttendanceScore(Math.min(100, (int) (dailyQty.size() * 100.0 / EVAL_DAYS)));

        // 多面手分
        Set<String> workerProcesses = success.stream()
                .map(ScanRecord::getProcessName).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        we.setVersatilityScore(Math.min(100, workerProcesses.size() * 100 / totalProcesses));

        // 最擅长工序
        we.setBestProcess(success.stream()
                .filter(r -> r.getProcessName() != null)
                .collect(Collectors.groupingBy(ScanRecord::getProcessName, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey).orElse("未知"));

        // 速度分 — 暂存 avgDaily，calibrateSpeedScores() 会用中位数基线覆盖
        we.setSpeedScore((int) avgDaily); // 临时值（待基线校准覆盖）

        // 趋势（最近7天 vs 前7天）
        LocalDate now = LocalDate.now();
        double recent7 = dailyQty.entrySet().stream()
                .filter(e -> !e.getKey().isBefore(now.minusDays(7)))
                .mapToLong(Map.Entry::getValue).average().orElse(0);
        double prev7 = dailyQty.entrySet().stream()
                .filter(e -> e.getKey().isBefore(now.minusDays(7))
                        && !e.getKey().isBefore(now.minusDays(14)))
                .mapToLong(Map.Entry::getValue).average().orElse(0);
        we.setTrend(recent7 > prev7 * 1.1 ? "up" : recent7 < prev7 * 0.9 ? "down" : "flat");

        return we;
    }

    /**
     * 速度分：以同组中位数为基线归一化至 [0,100]。
     * <ul>
     *   <li>中位数产量 = 50 分（「达标」基准线）</li>
     *   <li>2× 中位数产量 = 100 分（「卓越」上限）</li>
     *   <li>线性缩放，clamp [0, 100]</li>
     * </ul>
     * 相比纯百分位排名，此方案绝对可比：若整组产量偏低，分数真实偏低，不会因集体差而虚高。
     */
    private void calibrateSpeedScores(List<WorkerEfficiency> workers) {
        if (workers.isEmpty()) return;
        List<Double> avgs = workers.stream()
                .map(WorkerEfficiency::getDailyAvgOutput)
                .sorted().collect(Collectors.toList());
        // 同组中位数作为工厂基准线（无需外部配置）
        double medianOutput = avgs.get(avgs.size() / 2);
        double baseline = medianOutput > 0 ? medianOutput : 1.0;
        for (WorkerEfficiency w : workers) {
            // 中位数 → 50分，2× 中位数 → 100分，clamp [0, 100]
            w.setSpeedScore((int) Math.min(100, Math.max(0,
                    (w.getDailyAvgOutput() / baseline) * 50.0)));
            // 综合分（五维等权均值）
            w.setOverallScore((w.getSpeedScore() + w.getQualityScore()
                    + w.getStabilityScore() + w.getAttendanceScore()
                    + w.getVersatilityScore()) / 5);
        }
    }

    private double computeStddev(Collection<Long> values) {
        if (values.size() <= 1) return 0;
        double mean = values.stream().mapToLong(Long::longValue).average().orElse(0);
        double variance = values.stream()
                .mapToDouble(v -> (v - mean) * (v - mean)).sum() / values.size();
        return Math.sqrt(variance);
    }

    private List<ScanRecord> queryRecords(Long tenantId, LocalDateTime since) {
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", since)
          .isNull("factory_id");  // 只统计内部员工，排除外发工厂人员
        return scanRecordService.list(qw);
    }
}
