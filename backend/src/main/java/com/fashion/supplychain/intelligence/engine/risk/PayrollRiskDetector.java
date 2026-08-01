package com.fashion.supplychain.intelligence.engine.risk;

import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工资异常风险检测器（SUGGESTION模式）
 *
 * 检测逻辑：对比工人当月产量与近60天基线，产量超过2倍基线的工人标记为异常。
 * 包装 PayrollAnomalyDetectorTool 的核心检测逻辑，使其可被 ParallelRiskDetector 定时调用。
 */
@Slf4j
@Component
@Lazy
@RequiredArgsConstructor
public class PayrollRiskDetector implements RiskDetector {

    private final ScanRecordMapper scanRecordMapper;

    /** 超过基线2倍标记为异常 */
    private static final double ANOMALY_THRESHOLD = 2.0;
    /** 新工人单月产量上限（无基线时用此阈值） */
    private static final int NEW_HIGH_THRESHOLD = 500;

    @Override
    public RiskType getType() { return RiskType.PAYROLL; }

    @Override
    public List<RiskItem> detect(Long tenantId) {
        if (tenantId == null) return List.of();

        LocalDate periodStart = LocalDate.now().withDayOfMonth(1);
        LocalDate periodEnd = periodStart.withDayOfMonth(periodStart.lengthOfMonth());
        LocalDateTime dtStart = periodStart.atStartOfDay();
        LocalDateTime dtEnd = periodEnd.atTime(23, 59, 59);

        // 向前60天作为基线区间（不含当月）
        LocalDateTime baseStart = dtStart.minusDays(60);
        LocalDateTime baseEnd = dtStart.minusSeconds(1);

        // 查询当月各工人统计
        List<Map<String, Object>> current = scanRecordMapper
                .selectOperatorStatsBetween(tenantId, dtStart, dtEnd);
        if (current.isEmpty()) return List.of();

        // 查询基线期各工人统计（60天）
        List<Map<String, Object>> baseline = scanRecordMapper
                .selectOperatorStatsBetween(tenantId, baseStart, baseEnd);

        // 基线期天数 → 日均产量
        Map<String, Double> dailyAvgMap = buildDailyAvg(baseline, 60);

        int daysInPeriod = periodStart.lengthOfMonth();
        List<RiskItem> items = new ArrayList<>();

        for (Map<String, Object> row : current) {
            String opId = str(row.get("operatorId"));
            String opName = str(row.get("operatorName"));
            long curQty = toLong(row.get("totalQty"));
            double amount = toDouble(row.get("totalAmount"));

            Double avgDaily = dailyAvgMap.get(opId);
            if (avgDaily == null) {
                // 无历史基线 — 新工人，产量过高则提示
                if (curQty > NEW_HIGH_THRESHOLD) {
                    RiskItem item = RiskItem.create(RiskType.PAYROLL, "MEDIUM", 65.0);
                    item.setDescription("新工人 " + opName + " 月产量 " + curQty
                            + " 件，超过新工人阈值 " + NEW_HIGH_THRESHOLD + " 件，建议核实");
                    item.setSuggestedAction("核实新工人产量真实性，排除刷量或数据录入错误");
                    item.getMetadata().put("operatorId", opId);
                    item.getMetadata().put("operatorName", opName);
                    item.getMetadata().put("currentQty", curQty);
                    item.getMetadata().put("anomalyType", "NEW_HIGH");
                    items.add(item);
                }
            } else {
                double expectedQty = avgDaily * daysInPeriod;
                if (expectedQty > 10 && curQty > expectedQty * ANOMALY_THRESHOLD) {
                    double ratio = curQty / expectedQty;
                    String severity = ratio >= 3 ? "CRITICAL" : ratio >= 2.5 ? "HIGH" : "MEDIUM";
                    double score = Math.min(100, 60 + (ratio - 2) * 30);
                    RiskItem item = RiskItem.create(RiskType.PAYROLL, severity, score);
                    item.setDescription("工人 " + opName + " 当月产量 " + curQty
                            + " 件，预期约 " + String.format("%.0f", expectedQty)
                            + " 件（日均 " + String.format("%.1f", avgDaily) + " × " + daysInPeriod
                            + "天），超出 " + String.format("%.0f", (ratio - 1) * 100) + "%");
                    item.setSuggestedAction("冻结该条工资记录并通知财务审核，核实是否存在刷量或数据录入错误");
                    item.getMetadata().put("operatorId", opId);
                    item.getMetadata().put("operatorName", opName);
                    item.getMetadata().put("currentQty", curQty);
                    item.getMetadata().put("expectedQty", expectedQty);
                    item.getMetadata().put("anomalyRatio", ratio);
                    item.getMetadata().put("anomalyType", "HIGH");
                    item.getMetadata().put("totalAmount", amount);
                    items.add(item);
                }
            }
        }
        return items;
    }

    /** 将baseline统计列表转换为 operatorId → 日均产量 映射 */
    private Map<String, Double> buildDailyAvg(List<Map<String, Object>> rows, int days) {
        Map<String, Double> map = new HashMap<>();
        for (Map<String, Object> r : rows) {
            String id = str(r.get("operatorId"));
            long qty = toLong(r.get("totalQty"));
            if (id != null && !id.isEmpty() && qty > 0) {
                map.put(id, (double) qty / days);
            }
        }
        return map;
    }

    private String str(Object o) { return o == null ? "" : o.toString(); }

    private long toLong(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).longValue();
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return 0; }
    }

    private double toDouble(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return 0; }
    }
}
