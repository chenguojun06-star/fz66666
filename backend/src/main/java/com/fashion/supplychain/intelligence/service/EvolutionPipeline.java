package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.service.SystemDataMiner.DataSnapshot;
import com.fashion.supplychain.intelligence.service.SystemDataMiner.ScenarioGenerationResult;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionResult;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Service
public class EvolutionPipeline {

    @Autowired
    private SelfEvolutionEngine evolutionEngine;

    @Autowired
    private SystemDataMiner systemDataMiner;

    @Autowired
    private SelfCriticService selfCriticService;

    @Autowired
    private PromptEvolutionService promptEvolutionService;

    @Autowired
    private JdbcTemplate jdbc;

    @Value("${xiaoyun.evolution.self-play.enabled:true}")
    private boolean selfPlayEnabled;

    @Value("${xiaoyun.evolution.self-play.scenarios-per-cycle:5}")
    private int scenariosPerCycle;

    @Value("${xiaoyun.evolution.self-play.cron:0 0 3 * * ?}")
    private String evolutionCron;

    private final ConcurrentLinkedQueue<String> cycleLog = new ConcurrentLinkedQueue<>();
    private final AtomicInteger totalCycles = new AtomicInteger(0);
    private final AtomicInteger totalImprovements = new AtomicInteger(0);

    @PostConstruct
    public void init() {
        log.info("[EvolutionPipeline] 初始化 自演进={} 每轮场景数={} cron={}",
                selfPlayEnabled, scenariosPerCycle, evolutionCron);
    }

    @Scheduled(cron = "${xiaoyun.evolution.self-play.cron:0 0 3 * * ?}")
    public void scheduledEvolution() {
        if (!selfPlayEnabled) {
            log.debug("[EvolutionPipeline] 已禁用");
            return;
        }

        log.info("[EvolutionPipeline] ===== 主动进化开始 =====");
        long startMs = System.currentTimeMillis();

        try {
            runFullCycle();
        } catch (Exception e) {
            log.error("[EvolutionPipeline] 进化异常: {}", e.getMessage(), e);
        }

        log.info("[EvolutionPipeline] ===== 进化完成 耗时{}ms =====",
                System.currentTimeMillis() - startMs);
    }

    public void triggerEvolution(String reason) {
        log.info("[EvolutionPipeline] 手动触发: {}", reason);
        new Thread(() -> {
            try { runFullCycle(); } catch (Exception e) {
                log.warn("[EvolutionPipeline] 手动触发失败: {}", e.getMessage());
            }
        }, "evo-trigger-" + System.currentTimeMillis() % 10000).start();
    }

    private void runFullCycle() {
        Long tenantId = detectPrimaryTenant();
        if (tenantId == null) {
            log.warn("[EvolutionPipeline] 无可用租户");
            return;
        }

        List<DataSnapshot> snapshots = mineAllData(tenantId);
        logPanorama(snapshots);

        ScenarioGenerationResult scenarios = systemDataMiner.generatePracticeScenarios(tenantId);
        log.info("[EvolutionPipeline] 生成{}个推演场景", scenarios.totalGenerated());

        List<String> weakPoints = collectWeakPoints(tenantId);

        List<EvolutionProposal> proposals = generateProposals(snapshots, scenarios, weakPoints);

        List<EvolutionProposal> passedProposals = testProposals(proposals);

        int deployed = deployProposals(passedProposals);

        recordCycle(tenantId, snapshots, scenarios, proposals, passedProposals, deployed);

        totalCycles.incrementAndGet();
        totalImprovements.addAndGet(deployed);

        log.info("[EvolutionPipeline] 本轮: 提案{} → 通过{} → 上线{} → 弱项{}",
                proposals.size(), passedProposals.size(), deployed, weakPoints.size());
    }

    private List<DataSnapshot> mineAllData(Long tenantId) {
        return List.of(
                systemDataMiner.mineProductionOrders(tenantId),
                systemDataMiner.mineScanRecords(tenantId),
                systemDataMiner.mineMaterialPurchases(tenantId),
                systemDataMiner.mineQualityIssues(tenantId),
                systemDataMiner.mineFactoryPerformance(tenantId),
                systemDataMiner.mineReflectionPool(tenantId),
                systemDataMiner.mineAutoFeedback(tenantId),
                systemDataMiner.mineAgentExecutionLogs(tenantId)
        );
    }

    private void logPanorama(List<DataSnapshot> snapshots) {
        int totalRows = snapshots.stream().mapToInt(s -> s.rows().size()).sum();
        Map<String, Integer> dist = snapshots.stream()
                .collect(Collectors.toMap(
                        DataSnapshot::category,
                        s -> s.rows().size(),
                        (a, b) -> a,
                        LinkedHashMap::new));
        log.info("[EvolutionPipeline] 数据全景: {}行 {}", totalRows, dist);
    }

    private List<String> collectWeakPoints(Long tenantId) {
        DataSnapshot reflection = systemDataMiner.mineReflectionPool(tenantId);
        DataSnapshot feedback = systemDataMiner.mineAutoFeedback(tenantId);

        Set<String> weakPoints = new LinkedHashSet<>();

        reflection.rows().stream()
                .filter(r -> toDouble(r.get("quality_score")) < 0.6)
                .limit(10)
                .forEach(r -> {
                    String s = str(r.get("prompt_suggestion"));
                    if (!s.isBlank()) weakPoints.add(s);
                    String c = str(r.get("reflection_content"));
                    if (!c.isBlank() && c.length() < 200) weakPoints.add(c);
                });

        feedback.rows().stream()
                .limit(5)
                .forEach(r -> {
                    String reason = str(r.get("feedback_reason"));
                    if (!reason.isBlank()) weakPoints.add(reason);
                });

        return new ArrayList<>(weakPoints);
    }

    private List<EvolutionProposal> generateProposals(List<DataSnapshot> snapshots,
                                                       ScenarioGenerationResult scenarios,
                                                       List<String> weakPoints) {
        List<EvolutionProposal> allProposals = new ArrayList<>();

        EvolutionProposal feedbackProposal = evolutionEngine.proposeFromFeedback();
        if (feedbackProposal != null) allProposals.add(feedbackProposal);

        if (!weakPoints.isEmpty()) {
            String research = buildResearchFromWeakPoints(weakPoints, snapshots, scenarios);
            EvolutionProposal researchProposal = evolutionEngine.proposeFromResearch(research);
            if (researchProposal != null) allProposals.add(researchProposal);
        }

        if (scenarios.totalGenerated() > 0) {
            String simResearch = buildResearchFromScenarios(scenarios, snapshots);
            EvolutionProposal simProposal = evolutionEngine.proposeFromResearch(simResearch);
            if (simProposal != null) allProposals.add(simProposal);
        }

        return allProposals;
    }

    private String buildResearchFromWeakPoints(List<String> weakPoints,
                                                List<DataSnapshot> snapshots,
                                                ScenarioGenerationResult scenarios) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== 系统反思池中的薄弱点 ===\n");
        for (String wp : weakPoints) {
            sb.append("- ").append(wp).append("\n");
        }

        int totalDataRows = snapshots.stream().mapToInt(s -> s.rows().size()).sum();
        sb.append("\n系统当前有").append(totalDataRows).append("条运行数据。");
        sb.append("已生成").append(scenarios.totalGenerated()).append("个推演场景。\n");
        sb.append("\n请分析这些薄弱点的共同原因，提出1个具体的优化建议。");

        return sb.toString();
    }

    private String buildResearchFromScenarios(ScenarioGenerationResult scenarios,
                                               List<DataSnapshot> snapshots) {
        StringBuilder sb = new StringBuilder();
        sb.append("=== 基于全系统数据生成的推演场景 ===\n");

        List<String> scenarioList = scenarios.scenarios();
        for (int i = 0; i < Math.min(scenarioList.size(), 3); i++) {
            sb.append("[场景").append(i + 1).append("]\n");
            String s = scenarioList.get(i);
            sb.append(s.length() > 300 ? s.substring(0, 300) + "..." : s).append("\n\n");
        }

        int totalDataRows = snapshots.stream().mapToInt(s -> s.rows().size()).sum();
        sb.append("\n系统从").append(totalDataRows).append("条真实数据中生成了")
                .append(scenarios.totalGenerated()).append("个推演场景。\n");
        sb.append("请分析这些场景覆盖的领域，识别AI回答最需要强化的能力，提出1个优化建议。");

        return sb.toString();
    }

    private List<EvolutionProposal> testProposals(List<EvolutionProposal> proposals) {
        return proposals.stream()
                .map(p -> {
                    EvolutionResult result = evolutionEngine.testProposal(p);
                    if (result.passed()) {
                        log.info("[EvolutionPipeline] 提案通过: id={} category={} perfDelta={}",
                                p.id(), p.category(), result.performanceDelta());
                        return p;
                    }
                    log.info("[EvolutionPipeline] 提案被拒绝: id={} reason={}",
                            p.id(), result.testReport());
                    return null;
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private int deployProposals(List<EvolutionProposal> passedProposals) {
        int deployed = 0;
        for (EvolutionProposal p : passedProposals) {
            try {
                evolutionEngine.deployProposal(p);
                promptEvolutionService.approveProposal(p.id());
                deployed++;
                log.info("[EvolutionPipeline] 上线: id={} category={} desc={}",
                        p.id(), p.category(), p.description());
            } catch (Exception e) {
                log.warn("[EvolutionPipeline] 上线失败: id={} err={}", p.id(), e.getMessage());
            }
        }
        return deployed;
    }

    private void recordCycle(Long tenantId, List<DataSnapshot> snapshots,
                              ScenarioGenerationResult scenarios,
                              List<EvolutionProposal> proposals,
                              List<EvolutionProposal> passed,
                              int deployed) {
        try {
            jdbc.update(
                    "INSERT INTO t_xiaoyun_evolution_log (type, content, status, create_time) VALUES (?, ?, ?, ?)",
                    "EVOLUTION_CYCLE",
                    String.format("租户=%d 数据行=%d 场景=%d 提案=%d 通过=%d 上线=%d",
                            tenantId,
                            snapshots.stream().mapToInt(s -> s.rows().size()).sum(),
                            scenarios.totalGenerated(),
                            proposals.size(), passed.size(), deployed),
                    "COMPLETED", LocalDateTime.now());
        } catch (Exception e) {
            log.debug("[EvolutionPipeline] 周期记录失败: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Long detectPrimaryTenant() {
        try {
            List<Map<String, Object>> tenants = jdbc.queryForList(
                    "SELECT tenant_id FROM t_conversation_reflection "
                            + "WHERE resolved = 0 GROUP BY tenant_id "
                            + "ORDER BY COUNT(*) DESC LIMIT 1");
            if (!tenants.isEmpty()) {
                return toLong(tenants.get(0).get("tenant_id"));
            }
        } catch (Exception ignored) {}

        try {
            List<Map<String, Object>> tenants = jdbc.queryForList(
                    "SELECT tenant_id FROM t_intelligence_feedback "
                            + "WHERE feedback_result = 'rejected' "
                            + "GROUP BY tenant_id ORDER BY COUNT(*) DESC LIMIT 1");
            if (!tenants.isEmpty()) {
                return toLong(tenants.get(0).get("tenant_id"));
            }
        } catch (Exception ignored) {}

        return 1L;
    }

    public Map<String, Object> getStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalCycles", totalCycles.get());
        stats.put("totalImprovements", totalImprovements.get());
        stats.put("selfPlayEnabled", selfPlayEnabled);
        stats.put("scenariosPerCycle", scenariosPerCycle);
        stats.put("evolutionCron", evolutionCron);
        return stats;
    }

    private String str(Object val) {
        return val != null ? val.toString() : "";
    }

    private double toDouble(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (NumberFormatException e) { return 0; }
    }

    private long toLong(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.longValue();
        try { return Long.parseLong(val.toString()); } catch (NumberFormatException e) { return 0; }
    }
}
