package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.service.PatternProductionService;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 样板延期分析编排器 — 分析打样/交板延期情况，按纸样师维度统计
 */
@Service
@Slf4j
public class SampleDelayAnalysisOrchestrator {

    @Autowired
    private PatternProductionService patternProductionService;

    public Map<String, Object> analyze() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<PatternProduction> qw = new LambdaQueryWrapper<>();
        qw.eq(PatternProduction::getTenantId, tenantId)
          .eq(PatternProduction::getDeleteFlag, 0)
          .isNotNull(PatternProduction::getDeliveryTime)
          .select(PatternProduction::getId, PatternProduction::getStyleNo,
                  PatternProduction::getColor, PatternProduction::getPatternMaker,
                  PatternProduction::getDeliveryTime, PatternProduction::getCompleteTime,
                  PatternProduction::getStatus, PatternProduction::getQuantity,
                  PatternProduction::getReleaseTime);

        List<PatternProduction> samples = patternProductionService.list(qw);
        LocalDate today = LocalDate.now();

        List<PatternProduction> delayed = samples.stream().filter(s -> {
            if (s.getCompleteTime() != null && s.getDeliveryTime() != null) {
                return s.getCompleteTime().toLocalDate().isAfter(s.getDeliveryTime().toLocalDate());
            }
            if (s.getDeliveryTime() != null && s.getCompleteTime() == null) {
                boolean pastDue = s.getDeliveryTime().toLocalDate().isBefore(today);
                boolean notDone = !"COMPLETED".equalsIgnoreCase(s.getStatus());
                return pastDue && notDone;
            }
            return false;
        }).collect(Collectors.toList());

        List<PatternProduction> inProgress = samples.stream()
                .filter(s -> "IN_PROGRESS".equalsIgnoreCase(s.getStatus())
                        || "PENDING".equalsIgnoreCase(s.getStatus()))
                .collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalSamples", samples.size());
        result.put("delayedCount", delayed.size());
        result.put("delayRate", samples.isEmpty() ? 0 : Math.round(delayed.size() * 100.0 / samples.size()));
        result.put("inProgressCount", inProgress.size());

        // 按纸样师统计
        Map<String, List<PatternProduction>> byMaker = delayed.stream()
                .filter(s -> s.getPatternMaker() != null && !s.getPatternMaker().isBlank())
                .collect(Collectors.groupingBy(PatternProduction::getPatternMaker));

        List<Map<String, Object>> makerStats = byMaker.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", e.getKey());
            m.put("delayedCount", e.getValue().size());
            double avgDays = e.getValue().stream()
                    .mapToLong(s -> calcDelayDays(s, today))
                    .average().orElse(0);
            m.put("avgDelayDays", Math.round(avgDays * 10) / 10.0);
            return m;
        }).sorted(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("delayedCount")).reversed())
          .collect(Collectors.toList());
        result.put("byPatternMaker", makerStats);

        // 当前逾期但未完成的样板
        List<Map<String, Object>> pendingDelayed = delayed.stream()
                .filter(s -> s.getCompleteTime() == null)
                .sorted(Comparator.comparingLong((PatternProduction s) -> calcDelayDays(s, today)).reversed())
                .limit(5)
                .map(s -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("styleNo", s.getStyleNo());
                    m.put("color", s.getColor());
                    m.put("patternMaker", s.getPatternMaker());
                    m.put("delayDays", calcDelayDays(s, today));
                    m.put("status", s.getStatus());
                    return m;
                }).collect(Collectors.toList());
        result.put("pendingDelayed", pendingDelayed);

        return result;
    }

    private long calcDelayDays(PatternProduction s, LocalDate today) {
        if (s.getDeliveryTime() == null) return 0;
        LocalDate planned = s.getDeliveryTime().toLocalDate();
        LocalDate actual = s.getCompleteTime() != null ? s.getCompleteTime().toLocalDate() : today;
        return Math.max(0, ChronoUnit.DAYS.between(planned, actual));
    }
}
