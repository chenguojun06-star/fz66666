package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 工资异常检测工具 — AI Agent可调用的结构化Skill
 *
 * 功能：对比工人当月产量与近60天基线，筛选出产量异常（>2倍基线）的工人。
 * 用途：审批工资结算单前优先调用此工具，防止数据录入错误或恶意刷量。
 *
 * 调用示例（AI对话）：
 *   "帮我检查本月工资是否有异常"
 *   "检查 2026-03 的工资数据有没有问题"
 */
@Slf4j
@Component
public class PayrollAnomalyDetectorTool implements AgentTool {

    private static final ObjectMapper OM = new ObjectMapper();
    private static final DateTimeFormatter YM = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final double ANOMALY_THRESHOLD = 2.0;  // 超过基线2倍标记为HIGH
    private static final int    NEW_HIGH_THRESHOLD = 500;  // 新工人单月产量上限（flags for review）

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Override
    public String getName() {
        return "tool_payroll_anomaly_detect";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> periodProp = new HashMap<>();
        periodProp.put("type", "string");
        periodProp.put("description", "要检测的月份，格式 yyyy-MM，例如 2026-03。不填则默认本月。");
        props.put("period", periodProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("检查指定月份工人工资数量是否异常。通过对比近60天产量基线，自动标记" +
                "产量超过2倍正常值的工人、异常高产新工人等情况，防止工资刷量或数据录入错误。" +
                "在审批工资结算单前建议调用此工具。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of());
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String period = parsePeriod(argumentsJson);

            LocalDate periodStart = LocalDate.parse(period + "-01");
            LocalDate periodEnd = periodStart.withDayOfMonth(periodStart.lengthOfMonth());
            LocalDateTime dtStart = periodStart.atStartOfDay();
            LocalDateTime dtEnd = periodEnd.atTime(23, 59, 59);

            // 向前60天作为基线区间（不含当月）
            LocalDateTime baseStart = dtStart.minusDays(60);
            LocalDateTime baseEnd = dtStart.minusSeconds(1);

            // 查询当月各工人统计
            List<Map<String, Object>> current = scanRecordMapper
                    .selectOperatorStatsBetween(tenantId, dtStart, dtEnd);

            // 查询基线期各工人统计（60天）
            List<Map<String, Object>> baseline = scanRecordMapper
                    .selectOperatorStatsBetween(tenantId, baseStart, baseEnd);

            // 基线期天数 → 日均产量
            Map<String, Double> dailyAvgMap = buildDailyAvg(baseline, 60);

            // 分析异常
            List<Map<String, Object>> anomalies = new ArrayList<>();
            int totalOp = current.size();

            for (Map<String, Object> row : current) {
                String opId = str(row.get("operatorId"));
                String opName = str(row.get("operatorName"));
                long curQty = toLong(row.get("totalQty"));
                double amount = toDouble(row.get("totalAmount"));

                Double avgDaily = dailyAvgMap.get(opId);
                int daysInPeriod = periodStart.lengthOfMonth();

                if (avgDaily == null) {
                    // 无历史基线 — 新工人，产量过高则提示
                    if (curQty > NEW_HIGH_THRESHOLD) {
                        anomalies.add(buildAnomaly(opId, opName, curQty, 0,
                                amount, "NEW_HIGH", "新工人但月产量超过 " + NEW_HIGH_THRESHOLD + " 件，建议核实"));
                    }
                } else {
                    double expectedQty = avgDaily * daysInPeriod;
                    if (expectedQty > 10 && curQty > expectedQty * ANOMALY_THRESHOLD) {
                        String reason = String.format("当月 %d 件，预期约 %.0f 件（日均 %.1f × %d 天），超出 %.0f%%",
                                curQty, expectedQty, avgDaily, daysInPeriod,
                                (curQty / expectedQty - 1) * 100);
                        anomalies.add(buildAnomaly(opId, opName, curQty, (long) expectedQty,
                                amount, "HIGH", reason));
                    }
                }
            }

            // 按偏差倍数降序
            anomalies.sort((a, b) -> Long.compare(
                    toLong(b.get("currentQty")), toLong(a.get("currentQty"))));

            return buildResult(period, totalOp, anomalies);

        } catch (Exception e) {
            log.error("[PayrollAnomalyDetector] 执行失败", e);
            return "{\"error\": \"检测失败：" + e.getMessage() + "\"}";
        }
    }

    // ─── 工具方法 ─────────────────────────────────────────────────────────────

    private String parsePeriod(String json) {
        try {
            JsonNode args = OM.readTree(json);
            String p = args.path("period").asText("").trim();
            if (!p.isEmpty() && p.matches("\\d{4}-\\d{2}")) return p;
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        return LocalDate.now().format(YM);
    }

    /** 将 baseline 统计列表转换为 operatorId → 日均产量 映射 */
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

    private Map<String, Object> buildAnomaly(String opId, String opName, long curQty,
                                              long expectedQty, double amount,
                                              String level, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("operatorId", opId);
        m.put("operatorName", opName);
        m.put("currentQty", curQty);
        m.put("expectedQty", expectedQty);
        m.put("amount", String.format("%.2f", amount));
        m.put("anomaly", level);
        m.put("reason", reason);
        return m;
    }

    private String buildResult(String period, int totalOp, List<Map<String, Object>> anomalies) throws Exception {
        ObjectNode root = OM.createObjectNode();
        root.put("period", period);
        root.put("totalOperators", totalOp);
        root.put("anomalyCount", anomalies.size());

        ArrayNode arr = root.putArray("anomalies");
        for (Map<String, Object> a : anomalies) {
            ObjectNode node = OM.createObjectNode();
            a.forEach((k, v) -> {
                if (v instanceof Long) node.put(k, (Long) v);
                else if (v instanceof Integer) node.put(k, (Integer) v);
                else node.put(k, v == null ? "" : v.toString());
            });
            arr.add(node);
        }

        String summary = anomalies.isEmpty()
                ? String.format("%s共 %d 名工人，未发现产量异常，数据正常。", period, totalOp)
                : String.format("%s共 %d 名工人，发现 %d 条异常：%s", period, totalOp, anomalies.size(),
                    anomalies.stream().limit(3)
                        .map(a -> a.get("operatorName") + "(" + a.get("anomaly") + ")")
                        .reduce((a, b) -> a + "、" + b).orElse(""));
        root.put("summary", summary);
        return OM.writeValueAsString(root);
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
