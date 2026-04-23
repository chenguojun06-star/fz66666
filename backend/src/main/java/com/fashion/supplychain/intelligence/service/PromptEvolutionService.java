package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class PromptEvolutionService {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private SelfEvolutionEngine evolutionEngine;

    private final Map<String, String> activePromptOverrides = new ConcurrentHashMap<>();
    private final Map<String, String> activeParamOverrides = new ConcurrentHashMap<>();

    private static final String[] EVOLVABLE_PARAMS = {
            "xiaoyun.agent.rag.recall-top-k",
            "xiaoyun.agent.rag.similarity-threshold",
            "xiaoyun.agent.max-system-prompt-chars",
            "xiaoyun.agent.token-budget"
    };

    public Optional<String> getPromptOverride(String promptKey) {
        return Optional.ofNullable(activePromptOverrides.get(promptKey));
    }

    public Optional<String> getParamOverride(String paramKey) {
        return Optional.ofNullable(activeParamOverrides.get(paramKey));
    }

    public Map<String, String> getAllActiveOverrides() {
        Map<String, String> all = new HashMap<>();
        all.putAll(activePromptOverrides);
        all.putAll(activeParamOverrides);
        return all;
    }

    public boolean approveProposal(String proposalId) {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT * FROM t_xiaoyun_evolution_log WHERE id = ? AND status = 'TESTED'",
                    proposalId);
            if (rows.isEmpty()) {
                log.warn("[PromptEvolution] 提案{}不存在或未通过测试", proposalId);
                return false;
            }

            Map<String, Object> row = rows.get(0);
            String category = String.valueOf(row.get("category"));
            String afterState = String.valueOf(row.get("after_state"));

            switch (category) {
                case "prompt" -> {
                    activePromptOverrides.put(proposalId, afterState);
                    log.info("[PromptEvolution] Prompt覆盖已激活: {}", proposalId);
                }
                case "parameter" -> {
                    activeParamOverrides.put(proposalId, afterState);
                    log.info("[PromptEvolution] 参数覆盖已激活: {}", proposalId);
                }
                case "knowledge" -> {
                    log.info("[PromptEvolution] 知识库变更已自动应用");
                }
                default -> log.warn("[PromptEvolution] 未知类别: {}", category);
            }

            jdbc.update(
                    "UPDATE t_xiaoyun_evolution_log SET status = 'DEPLOYED', updated_at = ? WHERE id = ?",
                    LocalDateTime.now(), proposalId);
            return true;
        } catch (Exception e) {
            log.warn("[PromptEvolution] 审批失败: {}", e.getMessage());
            return false;
        }
    }

    public boolean rollbackProposal(String proposalId) {
        activePromptOverrides.remove(proposalId);
        activeParamOverrides.remove(proposalId);

        try {
            jdbc.update(
                    "UPDATE t_xiaoyun_evolution_log SET status = 'ROLLED_BACK', updated_at = ? WHERE id = ?",
                    LocalDateTime.now(), proposalId);
        } catch (Exception e) {
            log.debug("[PromptEvolution] 回滚记录失败: {}", e.getMessage());
        }

        log.info("[PromptEvolution] 提案{}已回滚", proposalId);
        return true;
    }

    public List<Map<String, Object>> getPendingProposals() {
        try {
            return jdbc.queryForList(
                    "SELECT * FROM t_xiaoyun_evolution_log "
                            + "WHERE status IN ('PROPOSED', 'TESTED') "
                            + "ORDER BY created_at DESC LIMIT 20");
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<Map<String, Object>> getEvolutionHistory(int days) {
        try {
            return jdbc.queryForList(
                    "SELECT * FROM t_xiaoyun_evolution_log "
                            + "WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) "
                            + "ORDER BY created_at DESC LIMIT 50", days);
        } catch (Exception e) {
            return List.of();
        }
    }
}
