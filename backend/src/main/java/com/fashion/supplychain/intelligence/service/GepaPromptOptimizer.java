package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.helper.PromptTemplateLoader;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

/**
 * GEPA 遗传优化器（借鉴 Hermes Self-Evolution GEPA）。
 *
 * <p>把 xiaoyun-base-prompt.yaml 的 17 个上下文块当基因，用遗传算法优化组合。
 * 解决痛点：prompt 块无优化机制，"该有的上下文被缩减"或"不该有的占用 token"。
 *
 * <p>核心概念：
 * <ul>
 *   <li><b>基因（Gene）</b>：一个 prompt 块（如 principles / toolGuide / domainHint）</li>
 *   <li><b>个体（Individual）</b>：一组基因的组合（含启用/禁用 + 顺序 + 权重）</li>
 *   <li><b>适应度（Fitness）</b>：用历史对话评分 + 块配置合理性估算</li>
 *   <li><b>种群（Population）</b>：N 个个体（N=10）</li>
 *   <li><b>代数（Generation）</b>：迭代次数（≤5 代，防过度优化）</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>GEPA 优化是离线 @Scheduled（每天 04:00），不影响在线响应</li>
 *   <li>适应度评估用历史数据 + 轻量模拟，不调 LLM（避免 100 次推理）</li>
 *   <li>经 ConstraintGates 三重门控验证后才存储最优个体</li>
 *   <li>优化结果存入 t_prompt_optimization 表</li>
 *   <li>AI Hard Limit ≤1 轮：GEPA 不触发 SelfCriticService 的异步批评循环</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class GepaPromptOptimizer {

    private static final int POPULATION_SIZE = 10;
    private static final int MAX_GENERATIONS = 5;
    private static final double MUTATION_RATE = 0.3;
    private static final double MIN_FITNESS_IMPROVEMENT = 0.5;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 17 个 prompt 块基因（与 AiAgentPromptHelper.assemblePrompt 中的块对应） */
    private static final List<String> GENE_BLOCKS = List.of(
            "principles", "collaboration", "toolStrategy", "toolAntiPatterns",
            "thinkToolGuide", "outputRequirements", "executionRules", "followupFormat",
            "richMediaFormat", "selfCritiqueFeedback", "memoryLimitations", "toolGuide",
            "domainHint", "context", "intelligence", "rag", "memoryBank"
    );

    @Autowired private PromptTemplateLoader promptTemplateLoader;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ConstraintGates constraintGates;
    @Autowired(required = false) private EvolutionEventLogger eventLogger;

    private final Random random = new Random();

    /**
     * 离线优化定时任务（每天 04:20 异步执行，不影响在线响应）。
     * 遍历所有有反馈数据的租户逐一优化；无租户时做全局优化。
     *
     * <p>【P1-5修复】原 04:00 与 SystemDoctorPatrolJob、SharedAgentMemoryService 同时执行。
     * 错峰到 04:20，避开 04:15 SharedMem 清理 + 04:30 AiSelfEvolutionJob。完整错峰表见 MemoryArchiveService 注释。
     */
    @Async("aiSelfCriticExecutor")
    @Scheduled(cron = "0 20 4 * * ?")
    public void scheduledOptimize() {
        try {
            List<Long> tenantIds = jdbc.queryForList(
                    "SELECT DISTINCT tenant_id FROM t_intelligence_feedback WHERE tenant_id IS NOT NULL",
                    Long.class);
            if (tenantIds.isEmpty()) {
                optimizeForTenant(null);
            } else {
                for (Long tid : tenantIds) {
                    optimizeForTenant(tid);
                }
            }
        } catch (Exception e) {
            log.warn("[GEPA] 定时优化任务失败: {}", e.getMessage());
        }
    }

    /**
     * 针对指定租户执行 GEPA 优化（可被定时任务或其他逻辑调用）。
     */
    public void optimizeForTenant(Long tenantId) {
        try {
            PromptIndividual baseline = loadBaselineIndividual();
            PromptIndividual best = runGeneticAlgorithm(baseline, tenantId);

            ConstraintGates.GateResult gateResult = constraintGates.validate(baseline, best);
            if (gateResult.isPassed()) {
                persistIndividual(tenantId, best, true);
                log.info("[GEPA] 优化完成 tenant={} gen={} fitness={}", tenantId, best.getGeneration(), best.getFitnessScore());
            } else {
                persistIndividual(tenantId, best, false);
                logGateFailure(tenantId, gateResult);
            }
        } catch (Exception e) {
            log.warn("[GEPA] 优化失败 tenant={}: {}", tenantId, e.getMessage());
        }
    }

    /**
     * 变异：随机启用/禁用低优先级块、调整顺序、调整权重。
     */
    public PromptIndividual mutate(PromptIndividual individual) {
        PromptIndividual mutated = individual.copy();
        for (String blockName : GENE_BLOCKS) {
            if (isKeyBlock(blockName)) continue;
            GeneConfig gene = mutated.getGenes().get(blockName);
            if (gene == null) continue;
            if (random.nextDouble() < MUTATION_RATE) {
                gene.setEnabled(!gene.isEnabled());
            }
            if (random.nextDouble() < MUTATION_RATE) {
                gene.setOrder(gene.getOrder() + random.nextInt(3) - 1);
            }
            if (random.nextDouble() < MUTATION_RATE) {
                gene.setWeight(Math.max(0.1, gene.getWeight() + (random.nextDouble() - 0.5) * 0.4));
            }
        }
        mutated.setGeneration(individual.getGeneration() + 1);
        return mutated;
    }

    /**
     * 适应度评估：用历史对话评分 + 块配置合理性估算（不调 LLM）。
     */
    public double evaluateFitness(PromptIndividual individual, Long tenantId) {
        double baselineScore = queryHistoricalAvgScore(tenantId);
        double configBonus = computeConfigBonus(individual);
        double sizePenalty = computeSizePenalty(individual);
        double fitness = baselineScore + configBonus - sizePenalty;
        individual.setFitnessScore(fitness);
        return fitness;
    }

    /**
     * 获取已应用的优化个体（applied=1 的最新记录）。
     *
     * <p>供 AiAgentPromptHelper 在 assemblePrompt 时调用，对 17 个 prompt 块应用 GEPA 优化值
     * （enabled/order/weight）。若不存在已应用个体，返回 Optional.empty()，调用方降级到原始流程。
     *
     * <p>多租户隔离：查询带 tenant_id WHERE（P0 铁律 4）。
     */
    public Optional<PromptIndividual> getAppliedIndividual(Long tenantId) {
        if (tenantId == null) return Optional.empty();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT individual_json, fitness_score, generation FROM t_prompt_optimization "
                            + "WHERE tenant_id = ? AND applied = 1 ORDER BY create_time DESC LIMIT 1",
                    tenantId);
            if (rows.isEmpty()) return Optional.empty();
            Map<String, Object> row = rows.get(0);
            String json = String.valueOf(row.get("individual_json"));
            if (json == null || json.isBlank()) return Optional.empty();

            @SuppressWarnings("unchecked")
            Map<String, Object> map = MAPPER.readValue(json, Map.class);
            PromptIndividual ind = new PromptIndividual();
            if (map.containsKey("generation") && map.get("generation") instanceof Number) {
                ind.setGeneration(((Number) map.get("generation")).intValue());
            }
            if (map.containsKey("fitnessScore") && map.get("fitnessScore") instanceof Number) {
                ind.setFitnessScore(((Number) map.get("fitnessScore")).doubleValue());
            }
            Object genesObj = map.get("genes");
            if (genesObj instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Map<String, Object>> genesMap = (Map<String, Map<String, Object>>) genesObj;
                for (Map.Entry<String, Map<String, Object>> entry : genesMap.entrySet()) {
                    GeneConfig gene = new GeneConfig();
                    Map<String, Object> g = entry.getValue();
                    if (g.containsKey("enabled") && g.get("enabled") instanceof Boolean) {
                        gene.setEnabled((Boolean) g.get("enabled"));
                    }
                    if (g.containsKey("order") && g.get("order") instanceof Number) {
                        gene.setOrder(((Number) g.get("order")).intValue());
                    }
                    if (g.containsKey("weight") && g.get("weight") instanceof Number) {
                        gene.setWeight(((Number) g.get("weight")).doubleValue());
                    }
                    ind.getGenes().put(entry.getKey(), gene);
                }
            }
            log.debug("[GEPA] 加载已应用个体 tenant={} gen={} fitness={} genes={}",
                    tenantId, ind.getGeneration(), ind.getFitnessScore(), ind.getGenes().size());
            return Optional.of(ind);
        } catch (Exception e) {
            log.debug("[GEPA] 加载已应用个体失败: {}", e.getMessage());
            return Optional.empty();
        }
    }

    // ==================== 私有方法 ====================

    private PromptIndividual runGeneticAlgorithm(PromptIndividual baseline, Long tenantId) {
        List<PromptIndividual> population = initPopulation(baseline);
        PromptIndividual best = baseline;
        double prevBestFitness = evaluateFitness(baseline, tenantId);

        for (int gen = 0; gen < MAX_GENERATIONS; gen++) {
            for (PromptIndividual ind : population) {
                evaluateFitness(ind, tenantId);
            }
            population.sort((a, b) -> Double.compare(b.getFitnessScore(), a.getFitnessScore()));
            PromptIndividual genBest = population.get(0);
            if (genBest.getFitnessScore() > best.getFitnessScore()) {
                best = genBest;
            }
            if (gen > 0 && best.getFitnessScore() - prevBestFitness < MIN_FITNESS_IMPROVEMENT) {
                logConvergenceStopped(tenantId, gen, best.getFitnessScore());
                break;
            }
            prevBestFitness = best.getFitnessScore();
            population = nextGeneration(population);
        }
        return best;
    }

    private List<PromptIndividual> initPopulation(PromptIndividual baseline) {
        List<PromptIndividual> pop = new ArrayList<>();
        pop.add(baseline.copy());
        for (int i = 1; i < POPULATION_SIZE; i++) {
            pop.add(mutate(baseline));
        }
        return pop;
    }

    private List<PromptIndividual> nextGeneration(List<PromptIndividual> current) {
        List<PromptIndividual> next = new ArrayList<>();
        int eliteCount = Math.max(2, POPULATION_SIZE / 5);
        for (int i = 0; i < eliteCount; i++) next.add(current.get(i).copy());
        while (next.size() < POPULATION_SIZE) {
            PromptIndividual parent = current.get(random.nextInt(POPULATION_SIZE / 2));
            next.add(mutate(parent));
        }
        return next;
    }

    private PromptIndividual loadBaselineIndividual() {
        PromptIndividual ind = new PromptIndividual();
        for (int i = 0; i < GENE_BLOCKS.size(); i++) {
            String blockName = GENE_BLOCKS.get(i);
            GeneConfig gene = new GeneConfig();
            gene.setEnabled(true);
            gene.setOrder(i);
            gene.setWeight(1.0);
            ind.getGenes().put(blockName, gene);
            ind.getBlockContents().put(blockName, loadBlockContent(blockName));
        }
        return ind;
    }

    private String loadBlockContent(String blockName) {
        try {
            return switch (blockName) {
                case "principles" -> promptTemplateLoader.getBasePrinciples();
                case "collaboration" -> promptTemplateLoader.getCollaborationRules();
                case "toolStrategy" -> promptTemplateLoader.getToolStrategy();
                case "toolAntiPatterns" -> promptTemplateLoader.getToolAntiPatterns();
                case "thinkToolGuide" -> promptTemplateLoader.getThinkToolGuide();
                case "outputRequirements" -> promptTemplateLoader.getOutputRequirements();
                case "executionRules" -> promptTemplateLoader.getExecutionRules();
                case "followupFormat" -> promptTemplateLoader.getFollowupFormat();
                case "richMediaFormat" -> promptTemplateLoader.getRichMediaFormat();
                case "selfCritiqueFeedback" -> promptTemplateLoader.getSelfCritiqueFeedback();
                default -> "";
            };
        } catch (Exception e) {
            return "";
        }
    }

    private boolean isKeyBlock(String blockName) {
        return "principles".equals(blockName) || "toolGuide".equals(blockName)
                || "memoryLimitations".equals(blockName);
    }

    private double queryHistoricalAvgScore(Long tenantId) {
        try {
            String sql = "SELECT AVG(100 - COALESCE(deviation_minutes, 0)) AS avg_score "
                    + "FROM t_intelligence_feedback WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"
                    + (tenantId != null ? " AND tenant_id = ?" : "");
            Double score = tenantId != null
                    ? jdbc.queryForObject(sql, Double.class, tenantId)
                    : jdbc.queryForObject(sql, Double.class);
            return score != null ? score : 70.0;
        } catch (Exception e) {
            return 70.0;
        }
    }

    private double computeConfigBonus(PromptIndividual individual) {
        long enabledCount = individual.getGenes().values().stream().filter(GeneConfig::isEnabled).count();
        long keyEnabled = individual.getGenes().entrySet().stream()
                .filter(e -> isKeyBlock(e.getKey()) && e.getValue().isEnabled()).count();
        return keyEnabled * 5.0 + Math.min(enabledCount * 0.5, 10.0);
    }

    private double computeSizePenalty(PromptIndividual individual) {
        int totalChars = individual.estimateTotalChars();
        int totalTokens = totalChars / 4;
        if (totalTokens <= 12000) return 0.0;
        return Math.min(20.0, (totalTokens - 12000) * 0.01);
    }

    private void persistIndividual(Long tenantId, PromptIndividual individual, boolean gatePassed) {
        try {
            String id = UUID.randomUUID().toString().replace("-", "").substring(0, 32);
            String json = MAPPER.writeValueAsString(individual.toSerializableMap());
            jdbc.update("INSERT INTO t_prompt_optimization (id, tenant_id, individual_json, fitness_score, "
                    + "generation, gate_passed, applied, create_time) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())",
                    id, tenantId, json, individual.getFitnessScore(),
                    individual.getGeneration(), gatePassed ? 1 : 0);
        } catch (Exception e) {
            log.warn("[GEPA] 持久化失败: {}", e.getMessage());
        }
    }

    private void logGateFailure(Long tenantId, ConstraintGates.GateResult result) {
        log.warn("[GEPA] 门控失败 tenant={} gate={} reason={}", tenantId, result.getFailedGate(), result.getReason());
        if (eventLogger != null) {
            eventLogger.log(EvolutionEventLogger.EvolutionEvent.of(tenantId, "CONSTRAINT_GATE_FAILED",
                    Map.of("gate", String.valueOf(result.getFailedGate()), "reason", String.valueOf(result.getReason()))));
        }
    }

    private void logConvergenceStopped(Long tenantId, int gen, double fitness) {
        if (eventLogger != null) {
            eventLogger.log(EvolutionEventLogger.EvolutionEvent.of(tenantId, "CONVERGENCE_STOPPED",
                    Map.of("generation", gen, "fitness", fitness)));
        }
    }

    // ==================== 嵌套 DTO ====================

    @Data
    public static final class GeneConfig {
        private boolean enabled = true;
        private int order = 0;
        private double weight = 1.0;

        public GeneConfig copy() {
            GeneConfig c = new GeneConfig();
            c.enabled = this.enabled;
            c.order = this.order;
            c.weight = this.weight;
            return c;
        }
    }

    @Data
    public static final class PromptIndividual {
        private Map<String, GeneConfig> genes = new LinkedHashMap<>();
        private Map<String, String> blockContents = new LinkedHashMap<>();
        private int generation = 0;
        private double fitnessScore = 0.0;

        public int estimateTotalChars() {
            int total = 0;
            for (Map.Entry<String, String> entry : blockContents.entrySet()) {
                GeneConfig gene = genes.get(entry.getKey());
                if (gene != null && gene.isEnabled()) total += entry.getValue().length();
            }
            return total;
        }

        public int getBlockChars(String blockName) {
            String content = blockContents.get(blockName);
            return content != null ? content.length() : 0;
        }

        public String getBlockContent(String blockName) {
            return blockContents.getOrDefault(blockName, "");
        }

        public PromptIndividual copy() {
            PromptIndividual c = new PromptIndividual();
            genes.forEach((k, v) -> c.genes.put(k, v.copy()));
            c.blockContents.putAll(blockContents);
            c.generation = generation;
            c.fitnessScore = fitnessScore;
            return c;
        }

        public Map<String, Object> toSerializableMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("generation", generation);
            m.put("fitnessScore", fitnessScore);
            Map<String, Object> genesMap = new LinkedHashMap<>();
            genes.forEach((k, v) -> {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("enabled", v.isEnabled());
                g.put("order", v.getOrder());
                g.put("weight", v.getWeight());
                genesMap.put(k, g);
            });
            m.put("genes", genesMap);
            return m;
        }
    }
}
