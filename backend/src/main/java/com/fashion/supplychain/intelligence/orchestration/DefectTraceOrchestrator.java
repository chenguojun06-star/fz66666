package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.DayTrend;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.ProcessDefect;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.WorkerDefect;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 次品溯源编排器 — 按订单聚合各工人的缺陷数据
 *
 * <p>算法：
 * <ol>
 *   <li>取指定订单所有扫码记录</li>
 *   <li>按 operatorName 分组，统计每个工人的缺陷次数/率</li>
 *   <li>按 processName 分组，找出高频缺陷工序 TOP3</li>
 *   <li>按日期分组，生成7天趋势</li>
 * </ol>
 */
@Service
@Slf4j
public class DefectTraceOrchestrator {

    @Autowired
    private ScanRecordService scanRecordService;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    public DefectTraceResponse trace(String orderId) {
        DefectTraceResponse resp = new DefectTraceResponse();
        resp.setWorkers(Collections.emptyList());
        resp.setHotProcesses(Collections.emptyList());
        resp.setTrend(Collections.emptyList());

        if (orderId == null || orderId.trim().isEmpty()) {
            return resp;
        }

        try {
            Long tenantId = UserContext.tenantId();
            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq("order_id", orderId.trim());
            List<ScanRecord> allScans = scanRecordService.list(qw);

            if (allScans.isEmpty()) {
                return resp;
            }

            // 统计总量
            int totalScans = allScans.size();
            long totalDefects = allScans.stream()
                    .filter(s -> "fail".equalsIgnoreCase(s.getScanResult()))
                    .count();
            resp.setTotalScans(totalScans);
            resp.setTotalDefects((int) totalDefects);
            resp.setOverallDefectRate(totalScans > 0
                    ? Math.round(totalDefects * 10000.0 / totalScans) / 100.0 : 0);

            // 按工人聚合
            resp.setWorkers(aggregateByWorker(allScans));

            // 按工序聚合 TOP3
            resp.setHotProcesses(aggregateByProcess(allScans));

            // 7天趋势
            resp.setTrend(buildTrend(allScans));

        } catch (Exception e) {
            log.error("[次品溯源] orderId={} 异常（降级返回空数据）: {}", orderId, e.getMessage(), e);
        }
        return resp;
    }

    private List<WorkerDefect> aggregateByWorker(List<ScanRecord> scans) {
        // 用 actualOperatorName 优先（委派场景），否则回退到 operatorName
        Map<String, List<ScanRecord>> byWorker = scans.stream()
                .filter(s -> resolveOperatorName(s) != null && !resolveOperatorName(s).isEmpty())
                .collect(Collectors.groupingBy(this::resolveOperatorName));

        List<WorkerDefect> workers = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byWorker.entrySet()) {
            List<ScanRecord> ws = entry.getValue();
            int total = ws.size();
            long fails = ws.stream().filter(s -> "fail".equalsIgnoreCase(s.getScanResult())).count();
            if (fails == 0) continue; // 只返回有缺陷的工人

            WorkerDefect wd = new WorkerDefect();
            wd.setOperatorName(entry.getKey());
            wd.setOperatorId(resolveOperatorId(ws.get(0)));
            wd.setTotalScans(total);
            wd.setDefectCount((int) fails);
            double rate = Math.round(fails * 10000.0 / total) / 100.0;
            wd.setDefectRate(rate);
            wd.setRiskLevel(rate > 10 ? "high" : rate > 5 ? "medium" : "low");

            // 该工人最高缺陷工序
            Map<String, Long> failByProcess = ws.stream()
                    .filter(s -> "fail".equalsIgnoreCase(s.getScanResult()) && s.getProcessName() != null)
                    .collect(Collectors.groupingBy(ScanRecord::getProcessName, Collectors.counting()));
            wd.setWorstProcess(failByProcess.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey).orElse("-"));

            workers.add(wd);
        }

        // 按缺陷数降序
        workers.sort(Comparator.comparingInt(WorkerDefect::getDefectCount).reversed());
        return workers;
    }

    private List<ProcessDefect> aggregateByProcess(List<ScanRecord> scans) {
        Map<String, List<ScanRecord>> byProcess = scans.stream()
                .filter(s -> s.getProcessName() != null && !s.getProcessName().isEmpty())
                .collect(Collectors.groupingBy(ScanRecord::getProcessName));

        List<ProcessDefect> list = new ArrayList<>();
        for (Map.Entry<String, List<ScanRecord>> entry : byProcess.entrySet()) {
            List<ScanRecord> ps = entry.getValue();
            long fails = ps.stream().filter(s -> "fail".equalsIgnoreCase(s.getScanResult())).count();
            if (fails == 0) continue;

            ProcessDefect pd = new ProcessDefect();
            pd.setProcessName(entry.getKey());
            pd.setTotalScans(ps.size());
            pd.setDefectCount((int) fails);
            pd.setDefectRate(Math.round(fails * 10000.0 / ps.size()) / 100.0);
            list.add(pd);
        }

        list.sort(Comparator.comparingInt(ProcessDefect::getDefectCount).reversed());
        return list.size() > 3 ? list.subList(0, 3) : list;
    }

    private List<DayTrend> buildTrend(List<ScanRecord> scans) {
        LocalDate today = LocalDate.now();
        LocalDateTime cutoff = today.minusDays(6).atStartOfDay();

        Map<String, int[]> dayStats = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            dayStats.put(today.minusDays(i).format(DATE_FMT), new int[]{0, 0});
        }

        for (ScanRecord s : scans) {
            if (s.getScanTime() == null || s.getScanTime().isBefore(cutoff)) continue;
            String day = s.getScanTime().toLocalDate().format(DATE_FMT);
            int[] stats = dayStats.get(day);
            if (stats == null) continue;
            stats[0]++; // total
            if ("fail".equalsIgnoreCase(s.getScanResult())) {
                stats[1]++; // defect
            }
        }

        List<DayTrend> trend = new ArrayList<>();
        for (Map.Entry<String, int[]> entry : dayStats.entrySet()) {
            DayTrend dt = new DayTrend();
            dt.setDate(entry.getKey());
            dt.setTotalScans(entry.getValue()[0]);
            dt.setDefectCount(entry.getValue()[1]);
            trend.add(dt);
        }
        return trend;
    }

    private String resolveOperatorName(ScanRecord s) {
        String actual = s.getActualOperatorName();
        if (actual != null && !actual.trim().isEmpty()) return actual.trim();
        String op = s.getOperatorName();
        return op != null ? op.trim() : "";
    }

    private String resolveOperatorId(ScanRecord s) {
        String actual = s.getActualOperatorId();
        if (actual != null && !actual.trim().isEmpty()) return actual.trim();
        return s.getOperatorId();
    }
}
