package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
@Slf4j
public class SelfEvolutionEngine {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private EvolutionSafetyGuard safetyGuard;

    private static final String EVOLUTION_LOG_TABLE = "t_xiaoyun_evolution_log";

    public enum EvolutionStatus { PROPOSED, TESTED, APPROVED, DEPLOYED, ROLLED_BACK }

    public record EvolutionProposal(
            String id, String category, String description,
            String beforeState, String afterState,
            double confidence, String source,
            LocalDateTime createdAt
    ) {}

    public record EvolutionResult(
            String proposalId, boolean passed,
            String testReport, double performanceDelta,
            boolean dbSafe, EvolutionStatus status
    ) {}

    public EvolutionProposal proposeFromResearch(String researchSummary) {
        String systemPrompt = "你是小云AI自进化引擎。基于以下技术调研结果，提出1个具体的优化建议。\n"
                + "要求：\n"
                + "1. 必须是可落地的具体改动（如调整参数、修改prompt片段、新增校验规则）\n"
                + "2. 不能涉及代码文件修改（只允许配置/prompt/参数变更）\n"
                + "3. 必须说明改动前后的差异\n"
                + "4. 给出置信度(0-100)\n"
                + "输出JSON：{category, description, beforeState, afterState, confidence}\n";

        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat(
                    "self_evolution", systemPrompt, researchSummary);
            if (result != null && result.isSuccess() && result.getContent() != null) {
                String content = result.getContent().trim();
                if (content.startsWith("```")) {
                    content = content.replaceAll("^```(?:json)?\\s*", "").replaceAll("\\s*```$", "");
                }
                Map<String, Object> parsed = parseSimpleJson(content);
                String id = "evo_" + System.currentTimeMillis();
                EvolutionProposal proposal = new EvolutionProposal(
                        id,
                        str(parsed, "category"),
                        str(parsed, "description"),
                        str(parsed, "beforeState"),
                        str(parsed, "afterState"),
                        dbl(parsed, "confidence"),
                        "github_research",
                        LocalDateTime.now()
                );
                persistProposal(proposal);
                log.info("[SelfEvolution] 新进化提案: id={} category={} confidence={}",
                        id, proposal.category(), proposal.confidence());
                return proposal;
            }
        } catch (Exception e) {
            log.warn("[SelfEvolution] 生成提案失败: {}", e.getMessage());
        }
        return null;
    }

    public EvolutionProposal proposeFromFeedback() {
        try {
            List<Map<String, Object>> lowFeedback = jdbc.queryForList(
                    "SELECT user_message, ai_response, feedback_score, feedback_reason "
                            + "FROM t_ai_conversation_memory "
                            + "WHERE feedback_score IS NOT NULL AND feedback_score <= 2 "
                            + "ORDER BY create_time DESC LIMIT 5");

            if (lowFeedback.isEmpty()) return null;

            StringBuilder sb = new StringBuilder("以下是近期低分AI回答（用户评分<=2）：\n");
            for (Map<String, Object> row : lowFeedback) {
                sb.append("- 问题: ").append(row.get("user_message")).append("\n");
                sb.append("  回答: ").append(limit(row.get("ai_response"), 200)).append("\n");
                sb.append("  评分: ").append(row.get("feedback_score"))
                        .append(" 原因: ").append(row.get("feedback_reason")).append("\n\n");
            }
            sb.append("请分析这些低分回答的共同问题，提出1个优化建议。");

            return proposeFromResearch(sb.toString());
        } catch (Exception e) {
            log.debug("[SelfEvolution] 反馈分析失败: {}", e.getMessage());
            return null;
        }
    }

    public EvolutionResult testProposal(EvolutionProposal proposal) {
        boolean dbSafe = safetyGuard.checkDatabaseImpact(proposal);
        if (!dbSafe) {
            log.warn("[SelfEvolution] 提案{}可能影响数据库，拒绝自动测试", proposal.id());
            return new EvolutionResult(proposal.id(), false,
                    "数据库影响检测未通过", 0, false, EvolutionStatus.ROLLED_BACK);
        }

        double perfDelta = safetyGuard.runPerformanceTest(proposal);
        boolean passed = perfDelta >= -0.05;

        String report = String.format("数据库安全=%b 性能变化=%.1f%% 结论=%s",
                dbSafe, perfDelta * 100, passed ? "通过" : "未通过");

        EvolutionStatus status = passed ? EvolutionStatus.TESTED : EvolutionStatus.ROLLED_BACK;
        updateProposalStatus(proposal.id(), status, report);

        log.info("[SelfEvolution] 提案{}测试完成: passed={} delta={}% report={}",
                proposal.id(), passed, String.format("%.1f", perfDelta * 100), report);
        return new EvolutionResult(proposal.id(), passed, report, perfDelta, dbSafe, status);
    }

    public boolean deployProposal(EvolutionProposal proposal) {
        EvolutionResult testResult = testProposal(proposal);
        if (!testResult.passed()) {
            log.warn("[SelfEvolution] 提案{}测试未通过，不部署", proposal.id());
            return false;
        }

        boolean applied = safetyGuard.applyChange(proposal);
        if (applied) {
            updateProposalStatus(proposal.id(), EvolutionStatus.DEPLOYED, "已自动部署");
            log.info("[SelfEvolution] 提案{}已部署: {}", proposal.id(), proposal.description());
        }
        return applied;
    }

    private void persistProposal(EvolutionProposal p) {
        try {
            jdbc.update("INSERT INTO " + EVOLUTION_LOG_TABLE
                            + " (id, category, description, before_state, after_state, "
                            + "confidence, source, status, created_at) "
                            + "VALUES (?,?,?,?,?,?,?,?,?)",
                    p.id(), p.category(), p.description(),
                    p.beforeState(), p.afterState(),
                    p.confidence(), p.source(), "PROPOSED", p.createdAt());
        } catch (Exception e) {
            log.debug("[SelfEvolution] 持久化提案失败（表可能不存在）: {}", e.getMessage());
        }
    }

    private void updateProposalStatus(String id, EvolutionStatus status, String report) {
        try {
            jdbc.update("UPDATE " + EVOLUTION_LOG_TABLE
                            + " SET status = ?, test_report = ?, updated_at = ? WHERE id = ?",
                    status.name(), report, LocalDateTime.now(), id);
        } catch (Exception e) {
            log.debug("[SelfEvolution] 更新提案状态失败: {}", e.getMessage());
        }
    }

    private Map<String, Object> parseSimpleJson(String json) {
        Map<String, Object> map = new HashMap<>();
        json = json.trim();
        if (json.startsWith("{")) json = json.substring(1);
        if (json.endsWith("}")) json = json.substring(0, json.length() - 1);
        String[] pairs = json.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
        for (String pair : pairs) {
            String[] kv = pair.split(":", 2);
            if (kv.length == 2) {
                String key = kv[0].trim().replace("\"", "");
                String val = kv[1].trim().replace("\"", "");
                map.put(key, val);
            }
        }
        return map;
    }

    private String str(Map<String, Object> m, String k) {
        Object v = m.get(k);
        return v != null ? v.toString() : "";
    }

    private double dbl(Map<String, Object> m, String k) {
        Object v = m.get(k);
        if (v == null) return 50;
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 50; }
    }

    private String limit(Object s, int max) {
        if (s == null) return "";
        String str = s.toString();
        return str.length() > max ? str.substring(0, max) + "..." : str;
    }
}
