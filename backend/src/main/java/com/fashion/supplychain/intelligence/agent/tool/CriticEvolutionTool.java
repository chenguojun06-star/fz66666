package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.mapper.AgentExecutionLogMapper;
import com.fashion.supplychain.intelligence.mapper.CrewSessionMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.service.QdrantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Critic 自进化工具 — CriticEvolutionTool
 *
 * <p>从历史 {@code t_agent_execution_log} 和低健康分 {@code t_crew_session} 中
 * 提炼优化洞察，写入 Qdrant 向量记忆与 {@code t_agent_evolution_log}，
 * 实现 AI 大脑的自我迭代进化。
 *
 * <p>闭环流程：
 * <pre>
 *   读取执行统计（用反馈低于阈值的 scene）
 *       ↓
 *   读取低健康分 Crew 会话（healthScore < threshold）
 *       ↓
 *   LLM 提炼优化洞察（Critic 模式提示词）
 *       ↓
 *   upsert Qdrant 向量 + 写 t_agent_evolution_log
 * </pre>
 */
@Slf4j
@Component
public class CriticEvolutionTool implements AgentTool {

    @Autowired private AgentExecutionLogMapper agentLogMapper;
    @Autowired private CrewSessionMapper crewSessionMapper;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private QdrantService qdrant;
    @Autowired private JdbcTemplate jdbc;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_critic_evolution";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("days", prop("integer",
                "回溯分析的天数（默认 7）"));
        props.put("min_feedback", prop("number",
                "反馈分低于此阈值触发学习（默认 3.5）"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("Critic 自进化：读取近期低反馈/低健康分的执行历史，用 AI 提炼改进洞察，"
                + "写入 Qdrant 向量记忆，让 Planner 下次规划时自动吸收改进经验。"
                + "当用户说'让 AI 自我改进''更新 AI 记忆''分析近期失败案例'时调用。");
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
            return JSON.writeValueAsString(Map.of("success", false, "error", "自进化功能仅平台超级管理员可用"));
        }
        Long ctxTenantId = UserContext.tenantId();
        if (ctxTenantId == null) {
            return JSON.writeValueAsString(Map.of("success", false, "error", "租户上下文丢失，请重新登录"));
        }
        long tenantId = ctxTenantId;
        JsonNode args = JSON.readTree(argumentsJson);
        int days = args.path("days").asInt(7);
        double minFeedback = args.path("min_feedback").asDouble(3.5);

        // ── STEP 1: 读取执行统计 ───────────────────────────────────────
        List<Map<String, Object>> abStats = agentLogMapper.selectAbStatsByScene(tenantId, days);
        List<Map<String, Object>> lowHits = abStats.stream()
                .filter(r -> {
                    Object fb = r.get("avgFeedback");
                    if (fb == null) return false;
                    try { return Double.parseDouble(fb.toString()) < minFeedback; } catch (Exception e) { return false; }
                })
                .toList();

        // ── STEP 2: 读取低健康分 Crew 会话 ─────────────────────────────
        int threshold = 60;
        int limit = 10;
        List<Map<String, Object>> lowSessionRows = crewSessionMapper.selectLowHealthSessions(tenantId, threshold, limit);

        int samplesTotal = lowHits.size() + lowSessionRows.size();
        if (samplesTotal == 0) {
            log.info("[CriticEvolution] tenant={} 近{}天无低反馈样本，跳过进化", tenantId, days);
            return JSON.writeValueAsString(Map.of(
                    "status", "SKIPPED",
                    "reason", "近 " + days + " 天无低反馈/低健康分样本",
                    "samples_analyzed", 0));
        }

        // ── STEP 3: 拼摘要 → LLM 提炼洞察 ─────────────────────────────
        String dataSummary = buildDataSummary(lowHits, lowSessionRows, days);
        String systemPrompt = buildCriticPrompt();
        String insight = callInference(tenantId, systemPrompt, dataSummary);

        // ── STEP 4: 写 Qdrant 向量记忆 ─────────────────────────────────
        boolean qdrantOk = false;
        try {
            String pointId = "critic_" + tenantId + "_" + System.currentTimeMillis();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("content", insight);
            payload.put("type", "critic_evolution");
            payload.put("days", String.valueOf(days));
            qdrant.upsertVector(pointId, tenantId, insight, payload);
            qdrantOk = true;
        } catch (Exception e) {
            log.debug("[CriticEvolution] Qdrant upsert 失败（可忽略）: {}", e.getMessage());
        }

        // ── STEP 5: 写 t_agent_evolution_log ───────────────────────────
        writeEvolutionLog(tenantId, days, samplesTotal, insight, qdrantOk);

        log.info("[CriticEvolution] tenant={} samples={} qdrant={} insight={}", tenantId,
                samplesTotal, qdrantOk, insight.length() > 50 ? insight.substring(0, 50) + "..." : insight);

        return JSON.writeValueAsString(Map.of(
                "status", "EVOLVED",
                "samples_analyzed", samplesTotal,
                "low_feedback_scenes", lowHits.size(),
                "low_health_sessions", lowSessionRows.size(),
                "qdrant_synced", qdrantOk,
                "insight", insight));
    }

    // ── 私有辅助 ────────────────────────────────────────────────────────

    private String buildDataSummary(List<Map<String, Object>> lowFeedback,
                                     List<Map<String, Object>> lowSessions, int days) {
        StringBuilder sb = new StringBuilder("【近" + days + "天低质量执行样本】\n");
        for (Map<String, Object> r : lowFeedback) {
            sb.append(String.format("scene=%s avgFeedback=%.1f runs=%s\n",
                    r.get("scene"), parseDouble(r.get("avgFeedback")), r.get("totalRuns")));
        }
        sb.append("\n【低健康分 Crew 会话】\n");
        for (Map<String, Object> row : lowSessions) {
            Object hs = row.get("health_score");
            int healthScore = hs == null ? 0 : Integer.parseInt(hs.toString());
            sb.append(String.format("healthScore=%d goal=%s criticInsight=%s\n",
                    healthScore, truncate(String.valueOf(row.getOrDefault("natural_goal", "")), 50),
                    truncate(String.valueOf(row.getOrDefault("critic_insight", "")), 60)));
        }
        return sb.toString();
    }

    private String buildCriticPrompt() {
        return "你是服装供应链 AI 系统的自进化 Critic Agent。\n"
                + "根据提供的低质量执行样本，提炼出 2-3 条具体可执行的改进洞察。\n"
                + "要求：聚焦问题本质，给出可操作建议，每条 ≤40 字，总字数 ≤200 字。\n"
                + "输出格式：洞察1: xxx；洞察2: xxx；洞察3（如有）: xxx";
    }

    private String callInference(long tenantId, String systemPrompt, String data) {
        try {
            var result = inferenceOrchestrator.chat("critic_evolution_" + tenantId, systemPrompt, data);
            if (result != null && result.isSuccess() && result.getContent() != null) {
                return result.getContent().trim();
            }
        } catch (Exception e) {
            log.warn("[CriticEvolution] 推理失败: {}", e.getMessage());
        }
        return "LLM 提炼失败，建议人工复查近期低反馈场景并更新规则库。";
    }

    private void writeEvolutionLog(long tenantId, int days, int samples, String insight, boolean qdrantOk) {
        try {
            jdbc.update("INSERT INTO t_agent_evolution_log "
                            + "(tenant_id, trigger_type, days_analyzed, samples_count, insight, qdrant_synced, evolved_at) "
                            + "VALUES (?,?,?,?,?,?,?)",
                    tenantId, "CRITIC_TOOL", days, samples, insight, qdrantOk ? 1 : 0, LocalDateTime.now());
        } catch (Exception e) {
            log.debug("[CriticEvolution] 写 t_agent_evolution_log 失败（可忽略）: {}", e.getMessage());
        }
    }

    private double parseDouble(Object v) {
        if (v == null) return 0.0;
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0.0; }
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }

    private Map<String, Object> prop(String type, String desc) {
        return Map.of("type", type, "description", desc);
    }
}
