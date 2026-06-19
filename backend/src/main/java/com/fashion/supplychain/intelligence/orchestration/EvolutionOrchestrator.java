package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.service.EvolutionPipeline;
import com.fashion.supplychain.intelligence.service.SelfCriticService;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.service.SystemDataMiner;
import com.fashion.supplychain.intelligence.service.SkillAutoCreationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自我进化统一编排器（借鉴 CL4R1T4S "统一可观测"设计）。
 *
 * <p>定位：轻量统一层，不接管 {@link EvolutionPipeline} 的核心进化流程，
 * 只做三件事：
 * <ol>
 *   <li><b>统一 metrics 汇总</b>：聚合 12 个进化组件的量化指标，解决"自我进化空转"问题</li>
 *   <li><b>健康巡检</b>：检测孤儿组件/死代码/数据堆积，输出可观测报告</li>
 *   <li><b>死代码补调度</b>：为缺失 @Scheduled 的清理方法补调度（如 MemoryNudge 过期清理）</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>不修改任何现有组件的核心逻辑（用户规则：业务逻辑严禁无意义重构）</li>
 *   <li>通过 ObjectProvider 注入，避免启动顺序问题，单个组件失败不影响整体</li>
 *   <li>所有方法 try-catch，绝不抛出异常阻断调用方</li>
 *   <li>不接管 EvolutionPipeline 的 @Scheduled（保持向后兼容）</li>
 * </ul>
 *
 * <p>12 个被观测组件：
 * <ol>
 *   <li>SelfCriticService — 自我批评（overallScore 0-100）</li>
 *   <li>DataTruthGuard — 数据真实性（trustScore 0-100）</li>
 *   <li>QuickPathQualityGate — 快速通道质量门（trustScore 0-100）</li>
 *   <li>RealTimeLearningLoop — 实时学习（consecutiveLowScore）</li>
 *   <li>EvolutionPipeline — 进化管道（totalCycles/totalImprovements）</li>
 *   <li>SystemDataMiner — 数据挖掘（DataSnapshot.stats）</li>
 *   <li>UserProfileEvolutionOrchestrator — 用户画像（confidence/evidenceCount）</li>
 *   <li>MemoryNudgeOrchestrator — 记忆轻推（pendingCount，本类补 @Scheduled）</li>
 *   <li>SkillEvolutionOrchestrator — 技能进化（useCount/successCount/avgRating）</li>
 *   <li>SkillAutoCreationService — 技能自动创建（qualityScore/confidence）</li>
 *   <li>ConversationReflectionOrchestrator — 对话复盘（qualityScore 0-1）</li>
 * </ol>
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
    @Autowired private JdbcTemplate jdbc;

    /**
     * 补调度：MemoryNudge 过期清理（每天 04:30）。
     *
     * <p>背景：{@link MemoryNudgeOrchestrator#expireOldNudges()} 是死代码，无任何调用方，
     * 导致 PENDING 记忆堆积（NUDGE_EXPIRY_HOURS=72）。本方法补 @Scheduled 调度。
     */
    @Scheduled(cron = "0 30 4 * * ?")
    public void scheduledExpireOldNudges() {
        try {
            MemoryNudgeOrchestrator nudge = memoryNudgeProvider.getIfAvailable();
            if (nudge != null) {
                nudge.expireOldNudges();
                log.debug("[EvolutionOrchestrator] MemoryNudge 过期清理完成");
            }
        } catch (Exception e) {
            log.warn("[EvolutionOrchestrator] MemoryNudge 过期清理失败: {}", e.getMessage());
        }
    }

    /**
     * 统一 metrics 汇总：聚合 12 个进化组件的量化指标。
     *
     * <p>用于解决"自我进化空转"问题——让所有组件的可观测指标集中可见，
     * 便于运维定位"哪个组件在空转/堆积/失效"。
     *
     * @param tenantId 租户 ID（部分组件需要租户上下文）
     * @return 12 个组件的量化指标 Map（key=组件名，value=指标 Map）
     */
    public Map<String, Object> getUnifiedMetrics(Long tenantId) {
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("generatedAt", LocalDateTime.now().toString());
        metrics.put("tenantId", tenantId);

        // 1. EvolutionPipeline（核心进化统计）
        metrics.put("evolutionPipeline", safeCall("evolutionPipeline", () -> {
            EvolutionPipeline p = evolutionPipelineProvider.getIfAvailable();
            return p != null ? p.getStats() : Map.of("available", false);
        }));

        // 2. SelfCriticService（自我批评统计，从 t_intelligence_feedback 聚合）
        metrics.put("selfCritic", safeCall("selfCritic", () -> aggregateSelfCriticStats(tenantId)));

        // 3. DataTruthGuard（数据真实性统计，从 t_ai_truth_check 聚合）
        metrics.put("dataTruthGuard", safeCall("dataTruthGuard", () -> aggregateDataTruthStats(tenantId)));

        // 4. QuickPathQualityGate（快速通道质量门统计）
        metrics.put("quickPathQualityGate", safeCall("quickPathQualityGate",
                () -> aggregateQuickPathStats(tenantId)));

        // 5. RealTimeLearningLoop（实时学习统计）
        metrics.put("realTimeLearningLoop", safeCall("realTimeLearningLoop",
                () -> aggregateRealTimeLearningStats(tenantId)));

        // 6. SystemDataMiner（数据挖掘统计，从 t_xiaoyun_evolution_log 聚合）
        metrics.put("systemDataMiner", safeCall("systemDataMiner",
                () -> aggregateSystemDataMinerStats(tenantId)));

        // 7. UserProfileEvolution（用户画像统计）
        metrics.put("userProfileEvolution", safeCall("userProfileEvolution",
                () -> aggregateUserProfileStats(tenantId)));

        // 8. MemoryNudge（记忆轻推统计）
        metrics.put("memoryNudge", safeCall("memoryNudge", () -> aggregateMemoryNudgeStats(tenantId)));

        // 9. SkillEvolution（技能进化统计）
        metrics.put("skillEvolution", safeCall("skillEvolution", () -> aggregateSkillStats(tenantId)));

        // 10. SkillAutoCreation（技能自动创建统计）
        metrics.put("skillAutoCreation", safeCall("skillAutoCreation",
                () -> aggregateSkillAutoCreationStats(tenantId)));

        // 11. ConversationReflection（对话复盘统计）
        metrics.put("conversationReflection", safeCall("conversationReflection",
                () -> aggregateConversationReflectionStats(tenantId)));

        return metrics;
    }

    /**
     * 健康巡检：检测孤儿组件/死代码/数据堆积。
     *
     * <p>输出结构化健康报告，便于运维定位问题。
     *
     * @return 健康报告 Map（status/issues/components）
     */
    public Map<String, Object> runHealthCheck() {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("checkedAt", LocalDateTime.now().toString());

        java.util.List<Map<String, Object>> issues = new java.util.ArrayList<>();
        java.util.List<Map<String, Object>> components = new java.util.ArrayList<>();

        // 检查每个组件的可用性
        checkComponentAvailable(components, "evolutionPipeline", evolutionPipelineProvider);
        checkComponentAvailable(components, "selfCriticService", selfCriticServiceProvider);
        checkComponentAvailable(components, "dataTruthGuard", dataTruthGuardProvider);
        checkComponentAvailable(components, "quickPathQualityGate", quickPathQualityGateProvider);
        checkComponentAvailable(components, "realTimeLearningLoop", realTimeLearningLoopProvider);
        checkComponentAvailable(components, "systemDataMiner", systemDataMinerProvider);
        checkComponentAvailable(components, "userProfileEvolution", userProfileEvolutionProvider);
        checkComponentAvailable(components, "memoryNudge", memoryNudgeProvider);
        checkComponentAvailable(components, "skillEvolution", skillEvolutionProvider);
        checkComponentAvailable(components, "skillAutoCreation", skillAutoCreationProvider);
        checkComponentAvailable(components, "conversationReflection", conversationReflectionProvider);

        // 检测 MemoryNudge PENDING 堆积
        try {
            Long pendingCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_memory_nudge WHERE status = 'PENDING'",
                    Long.class);
            if (pendingCount != null && pendingCount > 100) {
                issues.add(Map.of(
                        "severity", "WARN",
                        "component", "memoryNudge",
                        "issue", "PENDING 记忆堆积: " + pendingCount + " 条",
                        "suggestion", "检查 expireOldNudges 调度是否生效"
                ));
            }
        } catch (Exception ignored) {
        }

        // 检测 t_intelligence_feedback rejected 堆积
        try {
            Long rejectedCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_intelligence_feedback WHERE feedback_result = 'rejected'",
                    Long.class);
            if (rejectedCount != null && rejectedCount > 50) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "selfCritic",
                        "issue", "rejected 反馈堆积: " + rejectedCount + " 条",
                        "suggestion", "检查 SelfEvolutionEngine 是否消费了这些反馈"
                ));
            }
        } catch (Exception ignored) {
        }

        // 检测 t_conversation_reflection unresolved 堆积
        try {
            Long unresolvedCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_conversation_reflection WHERE resolved = 0",
                    Long.class);
            if (unresolvedCount != null && unresolvedCount > 100) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "conversationReflection",
                        "issue", "unresolved 复盘堆积: " + unresolvedCount + " 条",
                        "suggestion", "检查 ConversationReflectionOrchestrator 是否消费了这些复盘"
                ));
            }
        } catch (Exception ignored) {
        }

        report.put("components", components);
        report.put("issues", issues);
        report.put("status", issues.isEmpty() ? "HEALTHY" : "HAS_ISSUES");
        report.put("totalComponents", components.size());
        report.put("availableComponents",
                components.stream().filter(c -> Boolean.TRUE.equals(c.get("available"))).count());

        return report;
    }

    /**
     * 生成统一进化报告（metrics + healthCheck 合并）。
     */
    public Map<String, Object> getEvolutionReport(Long tenantId) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("generatedAt", LocalDateTime.now().toString());
        report.put("metrics", getUnifiedMetrics(tenantId));
        report.put("health", runHealthCheck());
        return report;
    }

    // ==================== 私有辅助方法 ====================

    private void checkComponentAvailable(java.util.List<Map<String, Object>> components,
                                          String name, ObjectProvider<?> provider) {
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

            // 最近 7 天平均分
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
            // DataTruthGuard 不写表，只做实时校验，无历史统计可聚合
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
            // QuickPathQualityGate 不写表，只做实时校验
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
            // RealTimeLearningLoop 内部有 consecutiveLowScoreByTenant，但无公开 getter
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

            // 最近 7 天进化日志
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
            // SkillAutoCreationService 写入 t_skill_template，与 SkillEvolutionOrchestrator 共表
            // 这里只标注来源，不重复统计（避免与 skillEvolution 双计数）
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
}
