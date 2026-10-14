package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import com.fashion.supplychain.common.QdrantService;

@Slf4j
@Service
@Lazy
public class AiSelfEvolutionService {

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired(required = false)
    private QdrantService qdrantService;

    /** 高置信度阈值：低于此值的执行记录视为"表现差"，取样喂给自进化分析 */
    private static final int LOW_CONFIDENCE_THRESHOLD = 50;
    /** 会话健康分阈值：低于此值视为异常会话 */
    private static final int LOW_HEALTH_THRESHOLD = 60;

    public String evolve(Long tenantId, int days) {
        List<Map<String, Object>> lowFeedbackLogs = findLowFeedbackLogs(tenantId, days);
        List<Map<String, Object>> lowHealthSessions = findLowHealthSessions(tenantId);

        if (lowFeedbackLogs.isEmpty() && lowHealthSessions.isEmpty()) {
            log.debug("[AiSelfEvolution] 租户{} 近{}天无低反馈样本", tenantId, days);
            return "SKIPPED";
        }

        try {
            String insights = generateInsights(lowFeedbackLogs, lowHealthSessions);
            if (insights != null && !insights.isBlank()) {
                saveEvolutionLog(tenantId, insights);
                if (qdrantService != null) {
                    qdrantService.upsertVector("evolution_" + System.currentTimeMillis(), tenantId, insights, Map.of("type", "self_evolution"));
                }
                log.info("[AiSelfEvolution] 租户{} 进化完成", tenantId);
                return "EVOLVED";
            }
            return "SKIPPED";
        } catch (Exception e) {
            log.warn("[AiSelfEvolution] 租户{} 进化失败: {}", tenantId, e.getMessage());
            return "FAILED";
        }
    }

    /**
     * 找出"表现差"的智能体执行记录，喂给自进化分析。
     *
     * <p>⚠️ 2026-10-14 修复（线上实测后重写）：原 SQL 选
     * {@code tool_name / arguments_json / result_summary / avg_feedback} 四列，
     * **这四列在 t_agent_execution_log 里一个都不存在**（照搬了别处的结构），
     * 于是每次查询都抛 {@code Unknown column}，又被 catch 成 {@code log.debug}
     * 吞掉、返回空列表 —— AI 自进化从上线起就没拿到过任何样本。
     *
     * <p>改用**真实存在且有信号**的列：这张表没有"用户评分"字段
     * （{@code user_feedback} / {@code feedback_note} 实测 0 条非空），
     * 真正能衡量表现的是 {@code confidence_score}（实测区间 29~85、均值 56.7）。
     * 所以口径改成"低置信度"，并把场景 / 路由 / 上下文 / 反思一并取出来，
     * 让 LLM 有东西可分析 —— 原来只喂"工具名 + 平均反馈"两个字段，
     * 就算查到了也提炼不出有效洞察。
     */
    private List<Map<String, Object>> findLowFeedbackLogs(Long tenantId, int days) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT scene, route, context_summary, reflection, optimization_suggestion, "
                            + "confidence_score, latency_ms "
                            + "FROM t_agent_execution_log "
                            + "WHERE tenant_id = ? AND confidence_score < ? AND create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) "
                            + "ORDER BY confidence_score ASC LIMIT 10",
                    tenantId, LOW_CONFIDENCE_THRESHOLD, days);
        } catch (Exception e) {
            // ⚠️ 必须 warn：原来只打 debug，查询坏了半年完全看不见
            log.warn("[AiSelfEvolution] 查询低置信度执行日志失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 找出低健康分的多智能体会话。
     *
     * <p>⚠️ 2026-10-14 修复：原 SQL 选 {@code session_id / tool_calls_count}，
     * 这两列在 t_crew_session 里都不存在（该表只有 {@code id / trace_id /
     * health_score / route_decision / result_summary / latency_ms / created_at ...}）；
     * 排序还用了不存在的 {@code create_time}（真列 {@code created_at}）。
     * 同样是被 catch 成 debug 后静默返回空。
     *
     * <p>改用真实列。注意该表当前是**空表**（实测 0 行），
     * 所以这里查不到数据是正常现象，与"SQL 写错"是两回事 ——
     * 修好之后它会在有数据时自然开始工作。
     */
    private List<Map<String, Object>> findLowHealthSessions(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT id, trace_id, health_score, route_decision, result_summary, latency_ms, created_at "
                            + "FROM t_crew_session "
                            + "WHERE tenant_id = ? AND health_score < ? "
                            + "ORDER BY created_at DESC LIMIT 10",
                    tenantId, LOW_HEALTH_THRESHOLD);
        } catch (Exception e) {
            log.warn("[AiSelfEvolution] 查询低健康分会话失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String generateInsights(List<Map<String, Object>> lowFeedbackLogs,
                                     List<Map<String, Object>> lowHealthSessions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("分析以下AI执行记录中的低质量场景，提炼2-3条可操作的改进洞察：\n\n");
        if (!lowFeedbackLogs.isEmpty()) {
            prompt.append("低置信度执行记录（置信度<").append(LOW_CONFIDENCE_THRESHOLD).append("）：\n");
            for (Map<String, Object> logEntry : lowFeedbackLogs) {
                prompt.append("- 场景: ").append(str(logEntry.get("scene")))
                      .append(" | 路由: ").append(str(logEntry.get("route")))
                      .append(" | 置信度: ").append(str(logEntry.get("confidence_score")))
                      .append(" | 耗时: ").append(str(logEntry.get("latency_ms"))).append("ms")
                      .append("\n  反思: ").append(str(logEntry.get("reflection"))).append("\n");
            }
        }
        if (!lowHealthSessions.isEmpty()) {
            prompt.append("低健康分会话（健康分<").append(LOW_HEALTH_THRESHOLD).append("）：\n");
            for (Map<String, Object> s : lowHealthSessions) {
                prompt.append("- 健康分: ").append(str(s.get("health_score")))
                      .append(" | 路由决策: ").append(str(s.get("route_decision")))
                      .append(" | 耗时: ").append(str(s.get("latency_ms"))).append("ms").append("\n");
            }
        }
        prompt.append("\n请输出2-3条简洁的改进洞察，每条不超过50字。");

        try {
            var result = inferenceOrchestrator.chat("self-evolution", "你是AI自进化分析器", prompt.toString());
            return result != null ? result.getContent() : null;
        } catch (Exception e) {
            log.warn("[AiSelfEvolution] LLM生成洞察失败: {}", e.getMessage());
            return null;
        }
    }

    /** Map 取值兜底：null 与 "null" 字符串都显示成占位，别让 prompt 里出现一片 null */
    private static String str(Object v) {
        if (v == null) return "-";
        String s = String.valueOf(v).trim();
        return (s.isEmpty() || "null".equals(s)) ? "-" : s;
    }

    /**
     * 落库一条进化记录。
     *
     * <p>⚠️ 2026-10-14 修复（守护脚本新抓出来的第 8 处）：原 INSERT 写的是
     * {@code (id, tenant_id, insights, status, create_time)}，
     * 而 t_agent_evolution_log 的真实列是
     * {@code id / tenant_id / scene / trigger_type / insight / qdrant_upserted /
     * avg_feedback / sample_count / extra_json / created_at} ——
     * **三列全错**：{@code insights} 真名 {@code insight}、
     * {@code status} 这一列根本不存在、{@code create_time} 真名 {@code created_at}。
     * 于是每次保存都抛 Unknown column，同样被 catch 成 warn 吞掉 ——
     * 也就是说 AI 自进化**就算分析出了洞察也永远存不下来**。
     *
     * <p>改成只写确定存在的列，其余交给表默认值
     * （trigger_type 默认 feedback_low、created_at 默认 CURRENT_TIMESTAMP）。
     */
    private void saveEvolutionLog(Long tenantId, String insights) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO t_agent_evolution_log (id, tenant_id, trigger_type, insight) "
                            + "VALUES (REPLACE(UUID(),'-',''), ?, 'self_evolution', ?)",
                    tenantId, insights);
        } catch (Exception e) {
            log.warn("[AiSelfEvolution] 保存进化日志失败: {}", e.getMessage());
        }
    }
}
