package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class AvgCompletionTimeTool implements AgentTool {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public String getName() {
        return "tool_avg_completion_time";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("factoryId", stringProp("工厂ID，筛选特定工厂的完成时间"));
        properties.put("category", stringProp("品类，如针织/梭织等"));
        properties.put("sampleSize", intProp("统计样本量(默认30，最大100)"));

        List<String> required = Collections.emptyList();
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("查询历史已完成订单的平均完成时间(天)，按工厂/品类分组统计。返回：平均天数、中位数、最快、最慢、准时率、样本量。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(properties);
        params.setRequired(required);
        function.setParameters(params);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return "{\"error\":\"租户上下文丢失\"}";
        }

        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(argumentsJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        }

        String factoryId = args.get("factoryId") != null ? args.get("factoryId").toString() : null;
        String category = args.get("category") != null ? args.get("category").toString() : null;
        int sampleSize = 30;
        if (args.get("sampleSize") instanceof Number n) {
            sampleSize = Math.min(Math.max(n.intValue(), 10), 100);
        }

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT o.factory_id, o.factory_name, ")
           .append("DATEDIFF(o.actual_end_date, o.create_time) AS completion_days, ")
           .append("CASE WHEN o.actual_end_date <= o.planned_end_date THEN 1 ELSE 0 END AS on_time ")
           .append("FROM t_production_order o ")
           .append("WHERE o.tenant_id = ? AND o.delete_flag = 0 ")
           .append("AND o.status IN ('completed','closed') ")
           .append("AND o.actual_end_date IS NOT NULL AND o.planned_end_date IS NOT NULL ");

        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        if (factoryId != null && !factoryId.isBlank()) {
            sql.append("AND o.factory_id = ? ");
            params.add(factoryId);
        }
        if (category != null && !category.isBlank()) {
            sql.append("AND o.style_no IN (SELECT style_no FROM t_style_info WHERE category = ? AND tenant_id = ?) ");
            params.add(category);
            params.add(tenantId);
        }

        sql.append("ORDER BY o.actual_end_date DESC LIMIT ?");
        params.add(sampleSize);

        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), params.toArray());

            if (rows.isEmpty()) {
                return "{\"message\":\"暂无已完成订单数据\"}";
            }

            List<Integer> days = new ArrayList<>();
            int onTimeCount = 0;
            Map<String, List<Integer>> factoryDaysMap = new LinkedHashMap<>();

            for (Map<String, Object> row : rows) {
                Object daysObj = row.get("completion_days");
                if (daysObj == null) continue;
                int d = ((Number) daysObj).intValue();
                if (d < 0) continue;
                days.add(d);

                if ("1".equals(String.valueOf(row.get("on_time"))) || Integer.valueOf(1).equals(row.get("on_time"))) {
                    onTimeCount++;
                }

                String fName = String.valueOf(row.getOrDefault("factory_name", "未知"));
                factoryDaysMap.computeIfAbsent(fName, k -> new ArrayList<>()).add(d);
            }

            if (days.isEmpty()) {
                return "{\"message\":\"暂无有效完成时间数据\"}";
            }

            Collections.sort(days);
            double avg = days.stream().mapToInt(Integer::intValue).average().orElse(0);
            double median = days.size() % 2 == 0
                    ? (days.get(days.size() / 2 - 1) + days.get(days.size() / 2)) / 2.0
                    : days.get(days.size() / 2);
            int fastest = days.get(0);
            int slowest = days.get(days.size() - 1);
            double onTimeRate = (double) onTimeCount / days.size() * 100;

            Map<String, Object> overall = new LinkedHashMap<>();
            overall.put("avgDays", Math.round(avg * 10) / 10.0);
            overall.put("medianDays", Math.round(median * 10) / 10.0);
            overall.put("fastestDays", fastest);
            overall.put("slowestDays", slowest);
            overall.put("onTimeRate", Math.round(onTimeRate * 10) / 10.0);
            overall.put("sampleSize", days.size());

            List<Map<String, Object>> factoryBreakdown = new ArrayList<>();
            for (Map.Entry<String, List<Integer>> entry : factoryDaysMap.entrySet()) {
                List<Integer> fDays = entry.getValue();
                Collections.sort(fDays);
                double fAvg = fDays.stream().mapToInt(Integer::intValue).average().orElse(0);
                Map<String, Object> fItem = new LinkedHashMap<>();
                fItem.put("factoryName", entry.getKey());
                fItem.put("avgDays", Math.round(fAvg * 10) / 10.0);
                fItem.put("sampleSize", fDays.size());
                fItem.put("fastestDays", fDays.get(0));
                fItem.put("slowestDays", fDays.get(fDays.size() - 1));
                factoryBreakdown.add(fItem);
            }
            factoryBreakdown.sort((a, b) -> Double.compare((double) b.get("avgDays"), (double) a.get("avgDays")));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("overall", overall);
            result.put("factoryBreakdown", factoryBreakdown);

            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(result);

        } catch (Exception e) {
            log.error("[{}] 查询失败", getName(), e);
            return "{\"error\":\"查询失败：" + e.getMessage() + "\"}";
        }
    }

    private Map<String, Object> stringProp(String description) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("type", "string");
        p.put("description", description);
        return p;
    }

    private Map<String, Object> intProp(String description) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("type", "integer");
        p.put("description", description);
        return p;
    }
}
