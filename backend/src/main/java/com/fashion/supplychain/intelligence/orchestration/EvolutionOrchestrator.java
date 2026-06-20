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
    @Autowired private ObjectProvider<SkillCrystallizationService> skillCrystallizationProvider;
    @Autowired private ObjectProvider<GepaPromptOptimizer> gepaPromptOptimizerProvider;
    @Autowired private ObjectProvider<EvolutionEventLogger> evolutionEventLoggerProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.ModelSelectionRouter> modelSelectionRouterProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.CostExplosionGuard> costExplosionGuardProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.MemoryBankDbService> memoryBankDbServiceProvider;
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

        // 12. SkillCrystallization（技能结晶化统计，D-021 合规新增）
        metrics.put("skillCrystallization", safeCall("skillCrystallization",
                () -> aggregateSkillCrystallizationStats(tenantId)));

        // 13. GepaPromptOptimizer（GEPA 遗传优化统计，D-021 合规新增）
        metrics.put("gepaPromptOptimizer", safeCall("gepaPromptOptimizer",
                () -> aggregateGepaPromptOptimizerStats(tenantId)));

       // 14. EvolutionEventLogger（进化事件审计统计，D-021 合规新增）
        metrics.put("evolutionEventLogger", safeCall("evolutionEventLogger",
                () -> aggregateEvolutionEventStats()));

        // 15. ModelSelectionRouter（per-call 模型选择分布统计，D-021 合规新增）
        metrics.put("modelSelectionRouter", safeCall("modelSelectionRouter",
                () -> aggregateModelSelectionStats()));

        // 16. CostExplosionGuard（成本爆炸防御统计，D-021 合规新增）
        metrics.put("costExplosionGuard", safeCall("costExplosionGuard",
                () -> aggregateCostExplosionGuardStats()));

        // 17. MemoryBankDb（ConPort 数据库化记忆银行，D-021 合规新增）
        metrics.put("memoryBankDb", safeCall("memoryBankDb",
                () -> aggregateMemoryBankStats(tenantId)));

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
        checkComponentAvailable(components, "skillCrystallization", skillCrystallizationProvider);
        checkComponentAvailable(components, "gepaPromptOptimizer", gepaPromptOptimizerProvider);
        checkComponentAvailable(components, "evolutionEventLogger", evolutionEventLoggerProvider);
        checkComponentAvailable(components, "memoryBankDb", memoryBankDbServiceProvider);
        checkComponentAvailable(components, "modelSelectionRouter", modelSelectionRouterProvider);
        checkComponentAvailable(components, "costExplosionGuard", costExplosionGuardProvider);

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

        // 检测 SkillCrystallization 结晶化技能数（D-021 合规新增）
        try {
            Long crystallizedCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_skill_template WHERE source = 'crystallized' AND delete_flag = 0",
                    Long.class);
            if (crystallizedCount != null && crystallizedCount > 200) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "skillCrystallization",
                        "issue", "结晶化技能堆积: " + crystallizedCount + " 条",
                        "suggestion", "检查是否有过期的结晶化技能需要清理"
                ));
            }
        } catch (Exception ignored) {
        }

        // 检测 EvolutionEventLogger 是否有写入（D-021 合规新增）
        try {
            EvolutionEventLogger logger = evolutionEventLoggerProvider.getIfAvailable();
            if (logger != null) {
                long eventCount = logger.countTodayEvents();
                if (eventCount == 0) {
                    issues.add(Map.of(
                            "severity", "INFO",
                            "component", "evolutionEventLogger",
                            "issue", "今日无进化事件记录",
                            "suggestion", "检查 SkillCrystallization/GepaPromptOptimizer 是否正常运行"
                    ));
                }
            }
        } catch (Exception ignored) {
        }

        // 检测 GepaPromptOptimizer 最近是否有优化记录（D-021 合规新增）
        try {
            Long recentOptCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM t_prompt_optimization WHERE create_time > DATE_SUB(NOW(), INTERVAL 2 DAY)",
                    Long.class);
            if (recentOptCount != null && recentOptCount == 0) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "gepaPromptOptimizer",
                        "issue", "最近2天无 GEPA 优化记录",
                        "suggestion", "检查 GepaPromptOptimizer @Scheduled 是否触发（cron=0 0 4 * * ?）"
                ));
            }
        } catch (Exception ignored) {
        }

        // 检测 Memory Bank 是否已迁移 + 孤儿关系（D-021 合规新增，ConPort 模式）
        try {
            MemoryBankDbService dbService = memoryBankDbServiceProvider.getIfAvailable();
            if (dbService != null) {
                long publicEntries = dbService.getEntryCount(0L);
                if (publicEntries == 0) {
                    issues.add(Map.of(
                            "severity", "WARN",
                            "component", "memoryBankDb",
                            "issue", "Memory Bank 公共记忆未迁移（tenantId=0 条目数为 0）",
                            "suggestion", "检查 MemoryBankMigrationRunner 是否执行，或 memory-bank 目录是否存在"
                    ));
                }
                long orphanRelations = dbService.getOrphanRelationCount(0L);
                if (orphanRelations > 0) {
                    issues.add(Map.of(
                            "severity", "WARN",
                            "component", "memoryBankDb",
                            "issue", "孤儿关系: " + orphanRelations + " 条（source/target 条目不存在）",
                            "suggestion", "清理 t_memory_bank_relation 中 source_entry_id/target_entry_id 不存在的记录"
                    ));
                }
            }
        } catch (Exception ignored) {
        }

        // 检测 ModelSelectionRouter 是否启用（D-021 合规新增）
        try {
            com.fashion.supplychain.intelligence.service.ModelSelectionRouter router =
                    modelSelectionRouterProvider.getIfAvailable();
            if (router == null) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "modelSelectionRouter",
                        "issue", "per-call 模型选择路由器未启用",
                        "suggestion", "检查 xiaoyun.model-selection.enabled 配置"
                ));
            } else if (!router.isEnabled()) {
                issues.add(Map.of(
                        "severity", "INFO",
                        "component", "modelSelectionRouter",
                        "issue", "per-call 模型选择已禁用（所有查询用同一模型，成本未优化）",
                        "suggestion", "设置 xiaoyun.model-selection.enabled=true 启用成本优化"
                ));
            }
        } catch (Exception ignored) {
        }

        // 检测 CostExplosionGuard Redis 连接（D-021 合规新增）
        try {
            com.fashion.supplychain.intelligence.service.CostExplosionGuard guard =
                    costExplosionGuardProvider.getIfAvailable();
            if (guard != null && guard.isEnabled() && !guard.isRedisAvailable()) {
                issues.add(Map.of(
                        "severity", "WARN",
                        "component", "costExplosionGuard",
                        "issue", "成本爆炸防御已启用但 Redis 不可用（熔断/重复检测将降级放行）",
                        "suggestion", "检查 Redis 连接配置，确保 StringRedisTemplate 可用"
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
        if (provider == null) {
            // 测试场景下 ObjectProvider 可能未被注入，防御性处理
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

    /** 技能结晶化统计（D-021 合规新增） */
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

    /** GEPA 遗传优化统计（D-021 合规新增） */
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

    /** 进化事件审计统计（D-021 合规新增） */
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

    /** Memory Bank 数据库化统计（D-021 合规新增，ConPort 模式） */
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

    /** per-call 模型选择分布统计（D-021 合规新增） */
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

    /** 成本爆炸防御统计（D-021 合规新增） */
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
