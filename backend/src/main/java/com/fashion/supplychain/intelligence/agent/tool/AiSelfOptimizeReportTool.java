package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.mapper.AiProcessRewardMapper;
import com.fashion.supplychain.intelligence.orchestration.AiAccuracyOrchestrator;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * AI 自优化报告工具 — AiSelfOptimizeReportTool
 *
 * <p>让 AI 小云能够主动向用户汇报自身的优化进展，回答"你最近进步了多少"
 * "你学到什么了""AI有没有在变得更准确"等问题。
 *
 * <h3>解决的痛点</h3>
 * <p>系统虽然有大量自我改进机制（CriticEvolution、规律挖掘、学习刷新、预测校正），
 * 但用户完全看不到 AI 有没有在改进、改进了什么。此工具打通"能力提升 → 用户可感知"
 * 这一最后一环，让所有自我改进工作变得可见有价值。</p>
 *
 * <h3>数据来源</h3>
 * <ul>
 *   <li>{@code t_agent_evolution_log} — 自进化历史（由 AiSelfEvolutionJob 每日写入）</li>
 *   <li>{@code t_ai_process_reward} — 工具评分趋势（PRM，每次工具调用自动记录）</li>
 *   <li>{@code AiAccuracyOrchestrator} — 交期预测准确率统计</li>
 * </ul>
 *
 * <p>触发词示例：
 * "你最近进步了吗"、"你学到什么了"、"你的准确率在提升吗"、"AI优化报告"、"自我优化情况"
 */
@Slf4j
@Component
public class AiSelfOptimizeReportTool implements AgentTool {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private AiProcessRewardMapper rewardMapper;
    @Autowired private AiAccuracyOrchestrator accuracyOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd");

    @Override
    public String getName() {
        return "tool_ai_self_optimize_report";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("days", prop("integer", "统计回溯天数（默认 14 天）"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("AI 自优化报告：查询 AI 小云近期的自我改进洞察、工具成功率趋势与交期预测准确率变化。"
                + "当用户问'你最近进步了多少''你学到什么了''AI变得更准了吗''自我优化情况'时调用。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of());
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (!UserContext.isSuperAdmin()) {
            return JSON.writeValueAsString(Map.of("success", false, "error", "自优化报告仅平台超级管理员可查看"));
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return JSON.writeValueAsString(Map.of("success", false, "error", "租户上下文丢失"));
        }
        JsonNode args = JSON.readTree(argumentsJson == null ? "{}" : argumentsJson);
        int days = args.path("days").asInt(14);
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        // ── 1. 进化历史统计 ──────────────────────────────────────────────
        int evolutionCount = queryEvolutionCount(tenantId, since);
        List<String> recentInsights = queryRecentInsights(tenantId, since, 2);

        // ── 2. 工具成功率趋势（PRM）──────────────────────────────────────
        List<Map<String, Object>> toolStats = rewardMapper.aggregateToolByTenant(tenantId, since);
        double overallAvgScore = toolStats.stream()
                .mapToDouble(r -> parseDouble(r.get("avg_score")))
                .average()
                .orElse(0.0);
        int totalToolCalls = toolStats.stream()
                .mapToInt(r -> parseInt(r.get("total")))
                .sum();

        // ── 3. 交期预测准确率（宽容 3 天误差，过去 30 天）───────────────
        String accuracyDesc = "暂无足够预测数据";
        try {
            var dashboard = accuracyOrchestrator.computeDashboard(tenantId, 3, 30);
            if (dashboard != null && dashboard.getTotalPredictions() > 0) {
                accuracyDesc = String.format("交期预测命中率 %.1f%%（%d 次预测，宽容±3天，过去30天）",
                        dashboard.getDeliveryHitRate() * 100, dashboard.getTotalPredictions());
            }
        } catch (Exception e) {
            log.debug("[AiSelfOptimizeReport] 准确率查询失败（可忽略）: {}", e.getMessage());
        }

        // ── 4. 组装报告 ──────────────────────────────────────────────────
        StringBuilder report = new StringBuilder();
        report.append(String.format("【AI小云自优化报告（过去%d天）】\n\n", days));

        // 进化摘要
        if (evolutionCount > 0) {
            report.append(String.format("📈 自我进化：共完成 %d 次 Critic 自进化分析\n", evolutionCount));
            if (!recentInsights.isEmpty()) {
                report.append("最新改进洞察：\n");
                for (int i = 0; i < recentInsights.size(); i++) {
                    report.append(String.format("  %d. %s\n", i + 1, recentInsights.get(i)));
                }
            }
        } else {
            report.append("📈 自我进化：暂无自进化记录（系统每天凌晨3:30自动执行）\n");
        }
        report.append("\n");

        // 工具成功率
        if (totalToolCalls > 0) {
            String scoreDesc = overallAvgScore >= 1.0 ? "良好" : overallAvgScore >= 0 ? "一般" : "需改善";
            report.append(String.format("🔧 工具执行：共调用 %d 次工具，平均评分 %.1f（%s）\n",
                    totalToolCalls, overallAvgScore, scoreDesc));
            // 展示最高分工具（最多3个）
            List<String> topTools = toolStats.stream()
                    .filter(r -> parseDouble(r.get("avg_score")) > 0)
                    .limit(3)
                    .map(r -> String.format("%s(%.1f分)", r.get("tool_name"), parseDouble(r.get("avg_score"))))
                    .toList();
            if (!topTools.isEmpty()) {
                report.append("  表现最佳工具：").append(String.join("、", topTools)).append("\n");
            }
        } else {
            report.append("🔧 工具执行：暂无工具调用记录\n");
        }
        report.append("\n");

        // 预测准确率
        report.append("🎯 预测准确率：").append(accuracyDesc).append("\n");

        // 总结
        report.append("\n");
        if (evolutionCount > 0 || totalToolCalls > 0) {
            report.append("✅ 每天凌晨系统自动运行6项AI优化任务：信号采集→规律挖掘→订单学习→");
            report.append("Critic自进化→每日洞察生成→巡逻质检。所有学习成果实时注入对话上下文。");
        } else {
            report.append("ℹ️ AI优化系统正在运行中，需要一定交互数据积累后才会出现学习成果。");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("days", days);
        result.put("evolution_count", evolutionCount);
        result.put("tool_calls", totalToolCalls);
        result.put("avg_tool_score", overallAvgScore);
        result.put("accuracy", accuracyDesc);
        result.put("report", report.toString());
        return JSON.writeValueAsString(result);
    }

    // ── 私有辅助 ────────────────────────────────────────────────────────

    private int queryEvolutionCount(Long tenantId, LocalDateTime since) {
        try {
            Integer cnt = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_agent_evolution_log WHERE tenant_id = ? AND evolved_at >= ?",
                    Integer.class, tenantId, since);
            return cnt == null ? 0 : cnt;
        } catch (Exception e) {
            log.debug("[AiSelfOptimizeReport] 查询进化次数失败（可忽略）: {}", e.getMessage());
            return 0;
        }
    }

    private List<String> queryRecentInsights(Long tenantId, LocalDateTime since, int limit) {
        try {
            return jdbc.queryForList(
                    "SELECT insight FROM t_agent_evolution_log "
                            + "WHERE tenant_id = ? AND evolved_at >= ? "
                            + "ORDER BY evolved_at DESC LIMIT ?",
                    String.class, tenantId, since, limit);
        } catch (Exception e) {
            log.debug("[AiSelfOptimizeReport] 查询洞察失败（可忽略）: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private double parseDouble(Object v) {
        if (v == null) return 0.0;
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0.0; }
    }

    private int parseInt(Object v) {
        if (v == null) return 0;
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return 0; }
    }

    private Map<String, Object> prop(String type, String desc) {
        return Map.of("type", type, "description", desc);
    }
}
