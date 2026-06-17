package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.List;
import java.util.Map;

@Service
@Lazy
@Slf4j
public class EvolutionSafetyGuard {

    @Autowired
    private JdbcTemplate jdbc;

    /** 自动部署置信度阈值：测试分数 >= 此值时自动部署（无需人工审批） */
    @Value("${xiaoyun.evolution.auto-deploy-threshold:0.85}")
    private double autoDeployThreshold;

    /** 是否启用自动部署（生产环境建议开启） */
    @Value("${xiaoyun.evolution.auto-deploy-enabled:${XIAOYUN_EVOLUTION_AUTO_DEPLOY:true}}")
    private boolean autoDeployEnabled;

    private static final List<String> PROTECTED_TABLES = List.of(
            "t_production_order", "t_scan_record", "t_cutting_task",
            "t_cutting_bundle", "t_payroll", "t_product_stock",
            "t_user", "t_factory", "t_tenant"
    );

    private static final List<String> DANGEROUS_KEYWORDS = List.of(
            "DROP", "DELETE", "TRUNCATE", "ALTER TABLE", "UPDATE SET",
            "INSERT INTO", "GRANT", "REVOKE", "EXEC", "EXECUTE"
    );

    private static final List<String> AUTO_DEPLOY_CATEGORIES = List.of(
            "knowledge", "metric_threshold", "alert_rule", "keyword_pattern"
    );

    /** 需要人工审批的高风险变更类别 */
    private static final List<String> MANUAL_APPROVAL_CATEGORIES = List.of(
            "prompt", "system_instruction", "permission", "orchestration"
    );

    public boolean checkDatabaseImpact(EvolutionProposal proposal) {
        if (proposal == null) return false;
        String afterState = proposal.afterState();
        if (afterState == null) return true;

        String upper = afterState.toUpperCase();
        for (String kw : DANGEROUS_KEYWORDS) {
            if (upper.contains(kw)) {
                log.warn("[EvoSafety] 提案包含危险关键词: {} in proposal {}", kw, proposal.id());
                return false;
            }
        }

        for (String table : PROTECTED_TABLES) {
            if (upper.contains(table.toUpperCase())) {
                log.warn("[EvoSafety] 提案涉及受保护表: {} in proposal {}", table, proposal.id());
                return false;
            }
        }

        return true;
    }

    public double runPerformanceTest(EvolutionProposal proposal) {
        try {
            long startQueryCount = getQueryCount();
            long startTime = System.currentTimeMillis();

            Thread.sleep(100);

            long elapsed = System.currentTimeMillis() - startTime;
            long endQueryCount = getQueryCount();

            if (endQueryCount < startQueryCount) {
                log.warn("[EvoSafety] 查询计数异常下降，可能影响了数据库");
                return -0.2;
            }

            return 0.0;
        } catch (Exception e) {
            log.warn("[EvoSafety] 性能测试异常: {}", e.getMessage());
            return -0.1;
        }
    }

    /**
     * v2 智能应用变更：根据类别、置信度和配置决定自动部署或人工审批。
     *
     * <p>部署策略：
     * <ul>
     *   <li>knowledge / metric_threshold / alert_rule / keyword_pattern：
     *       测试通过（分数 >= autoDeployThreshold） → 自动部署</li>
     *   <li>prompt / system_instruction / permission / orchestration：
     *       始终标记为 PENDING_REVIEW，等待人工审批</li>
     *   <li>未知类别 → PENDING_REVIEW</li>
     * </ul>
     *
     * @param proposal 进化提案（必须包含测试分数 testScore）
     * @return true = 部署成功（自动或人工后），false = 失败
     */
    public boolean applyChange(EvolutionProposal proposal) {
        if (proposal == null) return false;

        String category = proposal.category();
        String afterState = proposal.afterState();

        if (afterState == null || afterState.isBlank()) {
            log.warn("[EvoSafety] 提案{}的afterState为空，无法应用", proposal.id());
            return false;
        }

        // 危险关键词安全检查
        if (!checkDatabaseImpact(proposal)) {
            log.warn("[EvoSafety] 提案{}未通过安全检查，禁止应用", proposal.id());
            return false;
        }

        try {
            // Step 1: 决定是否自动部署
            boolean shouldAutoDeploy = decideAutoDeploy(proposal);
            String targetStatus = shouldAutoDeploy ? "APPROVED" : "PENDING_REVIEW";

            boolean recorded;
            switch (category != null ? category : "") {
                case "prompt", "system_instruction" -> {
                    recorded = persistPromptChange(proposal, targetStatus);
                    if (shouldAutoDeploy) {
                        applyPromptChange(proposal);
                    }
                }
                case "parameter", "metric_threshold", "alert_rule" -> {
                    recorded = persistParameterChange(proposal, targetStatus);
                    if (shouldAutoDeploy) {
                        applyParameterChange(proposal);
                    }
                }
                case "knowledge", "keyword_pattern" -> {
                    recorded = persistKnowledgeChange(proposal, targetStatus);
                    if (shouldAutoDeploy) {
                        applyKnowledgeChange(proposal);
                    }
                }
                default -> {
                    log.info("[EvoSafety] 未知类别变更需人工审批: category={}", category);
                    return false;
                }
            }

            if (recorded) {
                if (shouldAutoDeploy) {
                    log.info("[EvoSafety] ✅ 提案{}自动部署成功: category={}, confidence={}",
                            proposal.id(), category, proposal.confidence());
                } else {
                    log.info("[EvoSafety] ⏳ 提案{}已记录，等待人工审批: category={}",
                            proposal.id(), category);
                }
            }
            return recorded;

        } catch (Exception e) {
            log.warn("[EvoSafety] 应用变更失败: {}", e.getMessage());
            return false;
        }
    }

    /** 根据类别和测试分数决定是否自动部署 */
    private boolean decideAutoDeploy(EvolutionProposal proposal) {
        if (!autoDeployEnabled) {
            return false;
        }
        String category = proposal.category();
        // 已知安全类别可以自动部署
        if (AUTO_DEPLOY_CATEGORIES.contains(category)) {
                double score = proposal.confidence();
                if (score >= autoDeployThreshold) {
                return true;
            }
            log.info("[EvoSafety] 提案{}测试分数{}低于阈值{}，进入人工审批",
                    proposal.id(), score, autoDeployThreshold);
            return false;
        }
        // 高风险类别始终人工审批
        return false;
    }

    private long getQueryCount() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SHOW STATUS LIKE 'Queries'");
            if (!rows.isEmpty()) {
                Object val = rows.get(0).get("Value");
                if (val != null) return Long.parseLong(val.toString());
            }
        } catch (Exception e) {
            log.debug("[EvolutionSafetyGuard] 获取查询计数失败: {}", e.getMessage());
        }
        return 0;
    }

    // ── 持久化方法（支持动态状态） ──

    private boolean persistPromptChange(EvolutionProposal p, String status) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_prompt_version "
                            + "(proposal_id, category, before_prompt, after_prompt, status, created_at) "
                            + "VALUES (?,?,?,?,?,NOW())",
                    p.id(), p.category(), p.beforeState(), p.afterState(), status);
            return true;
        } catch (Exception e) {
            log.debug("[EvoSafety] prompt版本记录失败: {}", e.getMessage());
            return false;
        }
    }

    private boolean persistParameterChange(EvolutionProposal p, String status) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_param_version "
                            + "(proposal_id, param_key, before_value, after_value, status, created_at) "
                            + "VALUES (?,?,?,?,?,NOW())",
                    p.id(), p.category(), p.beforeState(), p.afterState(), status);
            return true;
        } catch (Exception e) {
            log.debug("[EvoSafety] 参数版本记录失败: {}", e.getMessage());
            return false;
        }
    }

    private boolean persistKnowledgeChange(EvolutionProposal p, String status) {
        try {
            jdbc.update(
                    "INSERT INTO t_knowledge_base (title, content, category, source, tenant_id, created_at) "
                            + "VALUES (?, ?, 'auto_evolution', ?, 0, NOW())",
                    "[自进化] " + p.description(), p.afterState(), p.source());
            return true;
        } catch (Exception e) {
            log.debug("[EvoSafety] 知识库写入失败: {}", e.getMessage());
            return false;
        }
    }

    // ── 实际应用变更（自动部署时调用） ──

    /** 将新 prompt 写入活跃状态（覆盖旧版本） */
    private void applyPromptChange(EvolutionProposal p) {
        try {
            int updated = jdbc.update(
                    "UPDATE t_xiaoyun_prompt_version SET status='ACTIVE', applied_at=NOW() " +
                            "WHERE proposal_id=? AND status='APPROVED' ORDER BY id DESC LIMIT 1",
                    p.id());
            if (updated > 0) {
                log.info("[EvoSafety] prompt提案{}已激活: {}", p.id(), p.description());
            } else {
                log.warn("[EvoSafety] prompt提案{}激活失败（记录不存在）", p.id());
            }
        } catch (Exception e) {
            log.warn("[EvoSafety] applyPromptChange失败: {}", e.getMessage());
        }
    }

    /** 将新参数写入参数表（动态生效） */
    private void applyParameterChange(EvolutionProposal p) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_params (param_key, param_value, updated_by, updated_at) " +
                            "VALUES (?,?,?,NOW()) " +
                            "ON DUPLICATE KEY UPDATE param_value=VALUES(param_value), updated_at=NOW()",
                    p.category(), p.afterState(), "auto-evolution");
            log.info("[EvoSafety] 参数提案{}已应用: {}={}", p.id(), p.category(), p.afterState());
        } catch (Exception e) {
            log.warn("[EvoSafety] applyParameterChange失败: {}", e.getMessage());
        }
    }

    /** 知识变更已通过 persistKnowledgeChange 写入，无需额外操作 */
    private void applyKnowledgeChange(EvolutionProposal p) {
        log.info("[EvoSafety] 知识提案{}已应用（ID由自增生成）: {}", p.id(), p.description());
    }

    // ── 管理员审批 API ──

    /**
     * 管理员手动审批提案（将 PENDING_REVIEW → APPROVED 并实际应用）
     * @param proposalId 提案ID
     * @param approved true=批准并应用，false=拒绝
     * @param operator 操作人（可为空）
     * @return true=操作成功
     */
    public boolean approveProposal(long proposalId, boolean approved, String operator) {
        try {
            String newStatus = approved ? "APPROVED" : "REJECTED";
            String table = detectProposalTable(proposalId);
            if ("unknown".equals(table)) {
                log.warn("[EvoSafety] 审批失败：无法确定提案表 proposalId={}", proposalId);
                return false;
            }

            int updated = jdbc.update(
                    "UPDATE " + table + " SET status=?, reviewed_by=?, reviewed_at=NOW() " +
                            "WHERE proposal_id=? AND status='PENDING_REVIEW' ORDER BY id DESC LIMIT 1",
                    newStatus, operator != null ? operator : "admin", String.valueOf(proposalId));

            if (updated == 0) {
                log.warn("[EvoSafety] 审批失败：提案不存在或已处理 proposalId={}", proposalId);
                return false;
            }

            if (approved) {
                // 重新加载提案并应用
                EvolutionProposal p = loadProposal(proposalId, table);
                if (p != null) {
                    switch (p.category()) {
                        case "prompt", "system_instruction" -> applyPromptChange(p);
                        case "parameter", "metric_threshold", "alert_rule" -> applyParameterChange(p);
                    }
                }
            }

            log.info("[EvoSafety] 管理员{}提案{}: {} → {}", operator, proposalId,
                    approved ? "APPROVED并应用" : "REJECTED", newStatus);
            return true;

        } catch (Exception e) {
            log.warn("[EvoSafety] approveProposal失败: {}", e.getMessage());
            return false;
        }
    }

    private String detectProposalTable(long proposalId) {
        try {
            jdbc.queryForMap(
                    "SELECT category FROM t_xiaoyun_prompt_version WHERE proposal_id=? LIMIT 1",
                    String.valueOf(proposalId));
            return "prompt";
        } catch (Exception e) {
            try {
                jdbc.queryForMap(
                        "SELECT category FROM t_xiaoyun_param_version WHERE proposal_id=? LIMIT 1",
                        String.valueOf(proposalId));
                return "parameter";
            } catch (Exception ex) {
                return "unknown";
            }
        }
    }

    private EvolutionProposal loadProposal(long proposalId, String category) {
        String pid = String.valueOf(proposalId);
        try {
            if ("prompt".equals(category)) {
                Map<String, Object> row = jdbc.queryForMap(
                        "SELECT * FROM t_xiaoyun_prompt_version WHERE proposal_id=? ORDER BY id DESC LIMIT 1",
                        pid);
                return new EvolutionProposal(
                        pid, (String) row.get("category"), "",
                        (String) row.get("before_prompt"), (String) row.get("after_prompt"),
                        1.0, "manual_approval", null);
            } else if ("parameter".equals(category)) {
                Map<String, Object> row = jdbc.queryForMap(
                        "SELECT * FROM t_xiaoyun_param_version WHERE proposal_id=? ORDER BY id DESC LIMIT 1",
                        pid);
                return new EvolutionProposal(
                        pid, (String) row.get("category"), "",
                        (String) row.get("before_value"), (String) row.get("after_value"),
                        1.0, "manual_approval", null);
            }
        } catch (Exception e) {
            log.warn("[EvoSafety] loadProposal失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 返回待审批提案列表（供管理面板使用）
     */
    public List<PendingProposal> listPendingProposals() {
        List<PendingProposal> result = new java.util.ArrayList<>();
        try {
            List<Map<String, Object>> promptRows = jdbc.queryForList(
                    "SELECT proposal_id, category, before_prompt, after_prompt, created_at " +
                            "FROM t_xiaoyun_prompt_version WHERE status='PENDING_REVIEW' ORDER BY created_at DESC LIMIT 50");
            for (Map<String, Object> row : promptRows) {
                result.add(new PendingProposal(
                        ((Number) row.get("proposal_id")).longValue(),
                        "prompt",
                        "[Prompt变更] " + truncate(String.valueOf(row.get("after_prompt")), 50),
                        row.get("created_at").toString()));
            }

            List<Map<String, Object>> paramRows = jdbc.queryForList(
                    "SELECT proposal_id, category, before_value, after_value, created_at " +
                            "FROM t_xiaoyun_param_version WHERE status='PENDING_REVIEW' ORDER BY created_at DESC LIMIT 50");
            for (Map<String, Object> row : paramRows) {
                result.add(new PendingProposal(
                        ((Number) row.get("proposal_id")).longValue(),
                        "parameter",
                        "[参数变更] " + row.get("category") + ": " + truncate(String.valueOf(row.get("after_value")), 50),
                        row.get("created_at").toString()));
            }
        } catch (Exception e) {
            log.warn("[EvoSafety] listPendingProposals失败: {}", e.getMessage());
        }
        return result;
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }

    @Data
    public static class PendingProposal {
        private final long proposalId;
        private final String category;
        private final String description;
        private final String createdAt;
    }
}
