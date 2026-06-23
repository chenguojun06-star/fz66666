package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.EvolutionPipeline;
import com.fashion.supplychain.intelligence.service.MemoryBankDbService;
import com.fashion.supplychain.intelligence.service.SelfCriticService;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.service.SystemDataMiner;
import com.fashion.supplychain.intelligence.service.SkillAutoCreationService;
import com.fashion.supplychain.intelligence.service.SkillCrystallizationService;
import com.fashion.supplychain.intelligence.service.GepaPromptOptimizer;
import com.fashion.supplychain.intelligence.service.EvolutionEventLogger;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自我进化统一编排器（借鉴 CL4R1T4S "统一可观测"设计）。
 *
 * <p>定位：轻量统一层，不接管 {@link EvolutionPipeline} 的核心进化流程，
 * 只做 metrics 聚合（供其他组件调用），@Scheduled 已迁移到各组件自身。
 *
 * <p>设计原则：
 * <ul>
 *   <li>不修改任何现有组件的核心逻辑</li>
 *   <li>通过 ObjectProvider 注入，避免启动顺序问题</li>
 *   <li>所有方法 try-catch，绝不抛出异常阻断调用方</li>
 *   <li>@Scheduled 调度已迁移到各组件（MemoryNudgeOrchestrator 等）</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class EvolutionOrchestrator {

    @Autowired private ObjectProvider<EvolutionPipeline> evolutionPipelineProvider;
    @Autowired private ObjectProvider<SelfCriticService> selfCriticServiceProvider;
    @Autowired private ObjectProvider<DataTruthGuard> dataTruthGuardProvider;
    @Autowired private ObjectProvider<QuickPathQualityGate> quickPathQualityGateProvider;
    @Autowired private ObjectProvider<RealTimeLearningLoop> realTimeLearningLoopProvider;
    @Autowired private ObjectProvider<SystemDataMiner> systemDataMinerProvider;
    @Autowired private ObjectProvider<UserProfileEvolutionOrchestrator> userProfileEvolutionProvider;
    @Autowired private ObjectProvider<MemoryNudgeOrchestrator> memoryNudgeProvider;
    @Autowired private ObjectProvider<SkillEvolutionOrchestrator> skillEvolutionProvider;
    @Autowired private ObjectProvider<SkillAutoCreationService> skillAutoCreationProvider;
    @Autowired private ObjectProvider<ConversationReflectionOrchestrator> conversationReflectionProvider;
    @Autowired private ObjectProvider<SkillCrystallizationService> skillCrystallizationProvider;
    @Autowired private ObjectProvider<GepaPromptOptimizer> gepaPromptOptimizerProvider;
    @Autowired private ObjectProvider<EvolutionEventLogger> evolutionEventLoggerProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.ModelSelectionRouter> modelSelectionRouterProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.CostExplosionGuard> costExplosionGuardProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.MemoryBankDbService> memoryBankDbServiceProvider;
    @Autowired private JdbcTemplate jdbc;

    // ==================== 私有辅助方法 ====================

    private void checkComponentAvailable(java.util.List<Map<String, Object>> components,
                                          String name, ObjectProvider<?> provider) {
        if (provider == null) {
            components.add(Map.of(
                    "name", name,
                    "available", false,
                    "className", "N/A"
            ));
            return;
        }
        Object bean = provider.getIfAvailable();
        components.add(Map.of(
                "name", name,
                "available", bean != null,
                "className", bean != null ? bean.getClass().getSimpleName() : "N/A"
        ));
    }

    private Map<String, Object> safeCall(String name, java.util.function.Supplier<Map<String, Object>> supplier) {
        try {
            Map<String, Object> result = supplier.get();
            return result != null ? result : Map.of("available", false);
        } catch (Exception e) {
            log.debug("[EvolutionOrchestrator] {} 指标聚合失败: {}", name, e.getMessage());
            return Map.of("available", false, "error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateSelfCriticStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", selfCriticServiceProvider.getIfAvailable() != null);
            try {
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT AVG(100 - COALESCE(deviation_minutes, 0)) AS avg_score, "
                                + "COUNT(*) AS total, "
                                + "SUM(CASE WHEN (100 - COALESCE(deviation_minutes, 0)) < 75 THEN 1 ELSE 0 END) AS low_score_count "
                                + "FROM t_intelligence_feedback "
                                + "WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) "
                                + (tenantId != null ? "AND tenant_id = ?" : ""),
                        tenantId != null ? new Object[]{tenantId} : new Object[]{});
                if (!rows.isEmpty()) {
                    stats.put("last7Days", rows.get(0));
                }
            } catch (Exception ignored) {
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateDataTruthStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", dataTruthGuardProvider.getIfAvailable() != null);
            stats.put("note", "实时校验组件，无历史统计");
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateQuickPathStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", quickPathQualityGateProvider.getIfAvailable() != null);
            stats.put("note", "实时质量门，无历史统计");
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateRealTimeLearningStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", realTimeLearningLoopProvider.getIfAvailable() != null);
            stats.put("note", "内部状态无公开 getter，需通过 SelfCritic 间接观测");
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateSystemDataMinerStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", systemDataMinerProvider.getIfAvailable() != null);
            try {
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "SELECT type, COUNT(*) AS cnt, MAX(create_time) AS last_time "
                                + "FROM t_xiaoyun_evolution_log "
                                + "WHERE create_time > DATE_SUB(NOW(), INTERVAL 7 DAY) "
                                + "GROUP BY type");
                stats.put("last7DaysLogs", rows);
            } catch (Exception ignored) {
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateUserProfileStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", userProfileEvolutionProvider.getIfAvailable() != null);
            if (tenantId != null) {
                try {
                    Long totalProfiles = jdbc.queryForObject(
                            "SELECT COUNT(*) FROM t_user_profile_evolution WHERE tenant_id = ?",
                            Long.class, tenantId);
                    stats.put("totalProfiles", totalProfiles);
                    List<Map<String, Object>> topProfiles = jdbc.queryForList(
                            "SELECT user_id, COUNT(*) AS evidence_count, MAX(version) AS max_version, MAX(updated_at) AS last_update "
                                    + "FROM t_user_profile_evolution WHERE tenant_id = ? "
                                    + "GROUP BY user_id ORDER BY evidence_count DESC LIMIT 5",
                            tenantId);
                    stats.put("topUsers", topProfiles);
                } catch (Exception ignored) {
                }
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateMemoryNudgeStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", memoryNudgeProvider.getIfAvailable() != null);
            try {
                String sql = "SELECT status, COUNT(*) AS cnt FROM t_memory_nudge "
                        + (tenantId != null ? "WHERE tenant_id = ? " : "")
                        + "GROUP BY status";
                List<Map<String, Object>> rows = tenantId != null
                        ? jdbc.queryForList(sql, tenantId)
                        : jdbc.queryForList(sql);
                stats.put("byStatus", rows);
            } catch (Exception ignored) {
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateSkillStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", skillEvolutionProvider.getIfAvailable() != null);
            try {
                String sql = "SELECT COUNT(*) AS total, "
                        + "SUM(CASE WHEN confidence >= 0.4 THEN 1 ELSE 0 END) AS active, "
                        + "SUM(use_count) AS total_uses, "
                        + "SUM(success_count) AS total_successes, "
                        + "AVG(avg_rating) AS avg_rating "
                        + "FROM t_skill_template "
                        + (tenantId != null ? "WHERE tenant_id = ?" : "");
                List<Map<String, Object>> rows = tenantId != null
                        ? jdbc.queryForList(sql, tenantId)
                        : jdbc.queryForList(sql);
                if (!rows.isEmpty()) {
                    stats.put("summary", rows.get(0));
                }
            } catch (Exception ignored) {
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateSkillAutoCreationStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", skillAutoCreationProvider.getIfAvailable() != null);
            stats.put("note", "与 skillEvolution 共表 t_skill_template，不重复统计");
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateConversationReflectionStats(Long tenantId) {
        try {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("available", conversationReflectionProvider.getIfAvailable() != null);
            try {
                String sql = "SELECT COUNT(*) AS total, "
                        + "SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS unresolved, "
                        + "AVG(quality_score) AS avg_quality, "
                        + "MAX(created_at) AS last_reflection "
                        + "FROM t_conversation_reflection "
                        + (tenantId != null ? "WHERE tenant_id = ?" : "");
                List<Map<String, Object>> rows = tenantId != null
                        ? jdbc.queryForList(sql, tenantId)
                        : jdbc.queryForList(sql);
                if (!rows.isEmpty()) {
                    stats.put("summary", rows.get(0));
                }
            } catch (Exception ignored) {
            }
            return stats;
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    private Map<String, Object> aggregateSkillCrystallizationStats(Long tenantId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("available", skillCrystallizationProvider.getIfAvailable() != null);
        try {
            String sql = "SELECT COUNT(*) AS skillCrystallizedCount, "
                    + "SUM(use_count) AS totalUses, "
                    + "AVG(confidence) AS avgConfidence, "
                    + "MAX(update_time) AS lastCrystallized "
                    + "FROM t_skill_template WHERE source = 'crystallized' AND delete_flag = 0"
                    + (tenantId != null ? " AND tenant_id = ?" : "");
            List<Map<String, Object>> rows = tenantId != null
                    ? jdbc.queryForList(sql, tenantId)
                    : jdbc.queryForList(sql);
            if (!rows.isEmpty()) stats.put("summary", rows.get(0));
        } catch (Exception ignored) {
        }
        return stats;
    }

    private Map<String, Object> aggregateGepaPromptOptimizerStats(Long tenantId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("available", gepaPromptOptimizerProvider.getIfAvailable() != null);
        try {
            String sql = "SELECT MAX(fitness_score) AS promptOptimizationFitness, "
                    + "SUM(gate_passed) AS gatePassedCount, "
                    + "COUNT(*) AS totalOptimizations, "
                    + "MAX(create_time) AS lastOptimization "
                    + "FROM t_prompt_optimization WHERE 1=1"
                    + (tenantId != null ? " AND tenant_id = ?" : "");
            List<Map<String, Object>> rows = tenantId != null
                    ? jdbc.queryForList(sql, tenantId)
                    : jdbc.queryForList(sql);
            if (!rows.isEmpty()) {
                Map<String, Object> summary = rows.get(0);
                stats.put("summary", summary);
                Object total = summary.get("totalOptimizations");
                Object passed = summary.get("gatePassedCount");
                if (total != null && passed != null) {
                    long totalLong = ((Number) total).longValue();
                    long passedLong = ((Number) passed).longValue();
                    stats.put("constraintGatePassRate", totalLong > 0 ? (double) passedLong / totalLong : 0.0);
                }
            }
        } catch (Exception ignored) {
        }
        return stats;
    }

    private Map<String, Object> aggregateEvolutionEventStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        EvolutionEventLogger logger = evolutionEventLoggerProvider.getIfAvailable();
        stats.put("available", logger != null);
        if (logger != null) {
            try {
                stats.put("evolutionEventCount", logger.countTodayEvents());
            } catch (Exception ignored) {
            }
        }
        return stats;
    }

    private Map<String, Object> aggregateMemoryBankStats(Long tenantId) {
        Map<String, Object> stats = new LinkedHashMap<>();
        MemoryBankDbService dbService = memoryBankDbServiceProvider.getIfAvailable();
        stats.put("available", dbService != null);
        if (dbService == null) return stats;
        try {
            long publicEntries = dbService.getEntryCount(0L);
            stats.put("memoryBankEntryCount", publicEntries);
            if (tenantId != null && tenantId != 0L) {
                stats.put("memoryBankTenantEntryCount", dbService.getEntryCount(tenantId));
                stats.put("memoryBankRelationCount", dbService.getRelationCount(tenantId));
            } else {
                stats.put("memoryBankRelationCount", dbService.getRelationCount(0L));
            }
            stats.put("memoryBankSemanticSearchCount", dbService.getSemanticSearchCount());
        } catch (Exception ignored) {
        }
        return stats;
    }

    private Map<String, Object> aggregateModelSelectionStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        com.fashion.supplychain.intelligence.service.ModelSelectionRouter router =
                modelSelectionRouterProvider.getIfAvailable();
        stats.put("available", router != null);
        if (router != null) {
            try {
                stats.putAll(router.getSelectionStats());
            } catch (Exception ignored) {
            }
        }
        return stats;
    }

    private Map<String, Object> aggregateCostExplosionGuardStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        com.fashion.supplychain.intelligence.service.CostExplosionGuard guard =
                costExplosionGuardProvider.getIfAvailable();
        stats.put("available", guard != null);
        if (guard != null) {
            try {
                stats.putAll(guard.getGuardStats());
            } catch (Exception ignored) {
            }
        }
        return stats;
    }
}
