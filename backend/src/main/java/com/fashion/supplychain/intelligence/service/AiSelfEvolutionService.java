package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class AiSelfEvolutionService {

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired(required = false)
    private QdrantService qdrantService;

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

    private List<Map<String, Object>> findLowFeedbackLogs(Long tenantId, int days) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT tool_name, arguments_json, result_summary, avg_feedback " +
                    "FROM t_agent_execution_log WHERE tenant_id = ? AND avg_feedback < 3.5 " +
                    "AND create_time >= DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY create_time DESC LIMIT 10",
                    tenantId, days);
        } catch (Exception e) {
            log.debug("[AiSelfEvolution] 查询低反馈日志失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> findLowHealthSessions(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT session_id, health_score, tool_calls_count " +
                    "FROM t_crew_session WHERE tenant_id = ? AND health_score < 60 " +
                    "ORDER BY create_time DESC LIMIT 10", tenantId);
        } catch (Exception e) {
            log.debug("[AiSelfEvolution] 查询低健康分会话失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private String generateInsights(List<Map<String, Object>> lowFeedbackLogs,
                                     List<Map<String, Object>> lowHealthSessions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("分析以下AI执行记录中的低反馈场景，提炼2-3条可操作的改进洞察：\n\n");
        if (!lowFeedbackLogs.isEmpty()) {
            prompt.append("低反馈工具调用（评分<3.5）：\n");
            for (Map<String, Object> logEntry : lowFeedbackLogs) {
                prompt.append("- 工具: ").append(logEntry.get("tool_name"))
                      .append(", 平均反馈: ").append(logEntry.get("avg_feedback")).append("\n");
            }
        }
        if (!lowHealthSessions.isEmpty()) {
            prompt.append("低健康分会话（评分<60）：\n");
            for (Map<String, Object> s : lowHealthSessions) {
                prompt.append("- 健康分: ").append(s.get("health_score"))
                      .append(", 工具调用数: ").append(s.get("tool_calls_count")).append("\n");
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

    private void saveEvolutionLog(Long tenantId, String insights) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO t_agent_evolution_log (id, tenant_id, insights, status, create_time) " +
                    "VALUES (REPLACE(UUID(),'-',''), ?, ?, 'EVOLVED', NOW())",
                    tenantId, insights);
        } catch (Exception e) {
            log.warn("[AiSelfEvolution] 保存进化日志失败: {}", e.getMessage());
        }
    }
}
