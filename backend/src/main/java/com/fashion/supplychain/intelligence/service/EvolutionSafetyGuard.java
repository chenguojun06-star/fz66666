package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class EvolutionSafetyGuard {

    @Autowired
    private JdbcTemplate jdbc;

    private static final List<String> PROTECTED_TABLES = List.of(
            "t_production_order", "t_scan_record", "t_cutting_task",
            "t_cutting_bundle", "t_payroll", "t_product_stock",
            "t_user", "t_factory", "t_tenant"
    );

    private static final List<String> DANGEROUS_KEYWORDS = List.of(
            "DROP", "DELETE", "TRUNCATE", "ALTER TABLE", "UPDATE SET",
            "INSERT INTO", "GRANT", "REVOKE", "EXEC", "EXECUTE"
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

    public boolean applyChange(EvolutionProposal proposal) {
        if (proposal == null) return false;

        String category = proposal.category();
        String afterState = proposal.afterState();

        if (afterState == null || afterState.isBlank()) {
            log.warn("[EvoSafety] 提案{}的afterState为空，无法应用", proposal.id());
            return false;
        }

        try {
            switch (category != null ? category : "") {
                case "prompt" -> {
                    log.info("[EvoSafety] Prompt变更已记录（需人工审批后生效）: {}", proposal.description());
                    return persistPromptChange(proposal);
                }
                case "parameter" -> {
                    log.info("[EvoSafety] 参数变更已记录（需人工审批后生效）: {}", proposal.description());
                    return persistParameterChange(proposal);
                }
                case "knowledge" -> {
                    log.info("[EvoSafety] 知识库变更自动应用: {}", proposal.description());
                    return persistKnowledgeChange(proposal);
                }
                default -> {
                    log.info("[EvoSafety] 未知类别变更需人工审批: category={}", category);
                    return false;
                }
            }
        } catch (Exception e) {
            log.warn("[EvoSafety] 应用变更失败: {}", e.getMessage());
            return false;
        }
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

    private boolean persistPromptChange(EvolutionProposal p) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_prompt_version "
                            + "(proposal_id, category, before_prompt, after_prompt, status, created_at) "
                            + "VALUES (?,?,?,?, 'PENDING_REVIEW', NOW())",
                    p.id(), p.category(), p.beforeState(), p.afterState());
            return true;
        } catch (Exception e) {
            log.debug("[EvoSafety] prompt版本记录失败: {}", e.getMessage());
            return false;
        }
    }

    private boolean persistParameterChange(EvolutionProposal p) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_param_version "
                            + "(proposal_id, param_key, before_value, after_value, status, created_at) "
                            + "VALUES (?,?,?,?, 'PENDING_REVIEW', NOW())",
                    p.id(), p.category(), p.beforeState(), p.afterState());
            return true;
        } catch (Exception e) {
            log.debug("[EvoSafety] 参数版本记录失败: {}", e.getMessage());
            return false;
        }
    }

    private boolean persistKnowledgeChange(EvolutionProposal p) {
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
}
