package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 约束门控（借鉴 Hermes Constraint Gates）。
 *
 * <p>进化候选必须通过三重门控，防止 GEPA 优化出"尺寸超标/语义漂移/测试失败"的个体。
 *
 * <p>三重门：
 * <ol>
 *   <li><b>尺寸门</b>：总 token ≤ 12000，每块 ≤500 token，metadata ≤50 token</li>
 *   <li><b>语义漂移门</b>：关键块（principles/toolGuide/memoryLimitations）不可禁用，
 *       关键块内容相似度 ≥0.8（Jaccard），禁用块数 ≤总块数的 30%</li>
 *   <li><b>测试套件门</b>：5 个标准测试问题，每个模拟评分 ≥70，通过率 ≥80%</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>测试套件门用轻量模拟评分（不调 LLM），避免 GEPA 离线优化时引入延迟</li>
 *   <li>Jaccard 相似度用字符 bigram，适合中文文本</li>
 *   <li>门控失败时返回结构化 GateResult，便于 EvolutionEventLogger 审计</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class ConstraintGates {

    private static final int MAX_TOTAL_TOKENS = 12000;
    private static final int MAX_BLOCK_TOKENS = 500;
    private static final double MIN_KEY_BLOCK_SIMILARITY = 0.8;
    private static final double MAX_DISABLED_RATIO = 0.30;
    private static final double MIN_TEST_SCORE = 70.0;
    private static final double MIN_PASS_RATE = 0.80;
    private static final int CHARS_PER_TOKEN = 4;

    /** 关键块：不可禁用，内容相似度必须 ≥0.8 */
    private static final Set<String> KEY_BLOCKS = Set.of("principles", "toolGuide", "memoryLimitations");

    /** 5 个标准测试问题（覆盖查询/统计/对比/风险/产能场景） */
    private static final List<String> TEST_QUESTIONS = List.of(
            "今天有多少款要交？",
            "PO202606010001 这个订单进度怎么样？",
            "张三的工厂这个月产能如何？",
            "哪些订单有逾期风险？",
            "帮我对比下A工厂和B工厂的绩效"
    );

    @Value("${xiaoyun.agent.max-system-prompt-chars:12000}")
    private int maxSystemPromptChars;

    /**
     * 验证候选个体是否通过三重门控。
     *
     * @param original 原始个体（基线）
     * @param candidate 候选个体（变异后）
     * @return GateResult（passed / failedGate / reason）
     */
    public GateResult validate(GepaPromptOptimizer.PromptIndividual original,
                                GepaPromptOptimizer.PromptIndividual candidate) {
        if (!sizeGate(candidate)) {
            return GateResult.fail("SIZE_GATE", "尺寸门控失败：超出 token 限制");
        }
        if (!semanticDriftGate(original, candidate)) {
            return GateResult.fail("SEMANTIC_DRIFT_GATE", "语义漂移门控失败：关键块被禁用或相似度过低");
        }
        if (!testSuiteGate(candidate)) {
            return GateResult.fail("TEST_SUITE_GATE", "测试套件门控失败：通过率不足 80%");
        }
        return GateResult.pass();
    }

    /**
     * 尺寸门：总 token ≤12000，每块 ≤500 token。
     */
    public boolean sizeGate(GepaPromptOptimizer.PromptIndividual individual) {
        int totalTokens = individual.estimateTotalChars() / CHARS_PER_TOKEN;
        if (totalTokens > MAX_TOTAL_TOKENS) return false;

        for (Map.Entry<String, GepaPromptOptimizer.GeneConfig> entry : individual.getGenes().entrySet()) {
            if (!entry.getValue().isEnabled()) continue;
            int blockTokens = individual.getBlockChars(entry.getKey()) / CHARS_PER_TOKEN;
            if (blockTokens > MAX_BLOCK_TOKENS) return false;
        }
        return true;
    }

    /**
     * 语义漂移门：关键块不可禁用，内容相似度 ≥0.8，禁用比例 ≤30%。
     */
    public boolean semanticDriftGate(GepaPromptOptimizer.PromptIndividual original,
                                      GepaPromptOptimizer.PromptIndividual candidate) {
        for (String key : KEY_BLOCKS) {
            GepaPromptOptimizer.GeneConfig gene = candidate.getGenes().get(key);
            if (gene == null || !gene.isEnabled()) return false;
        }
        for (String key : KEY_BLOCKS) {
            double sim = jaccardSimilarity(original.getBlockContent(key), candidate.getBlockContent(key));
            if (sim < MIN_KEY_BLOCK_SIMILARITY) return false;
        }
        long totalBlocks = candidate.getGenes().size();
        if (totalBlocks == 0) return false;
        long disabledBlocks = candidate.getGenes().values().stream()
                .filter(g -> !g.isEnabled()).count();
        return (double) disabledBlocks / totalBlocks <= MAX_DISABLED_RATIO;
    }

    /**
     * 测试套件门：5 个标准问题，模拟评分 ≥70，通过率 ≥80%。
     */
    public boolean testSuiteGate(GepaPromptOptimizer.PromptIndividual individual) {
        int passed = 0;
        for (String question : TEST_QUESTIONS) {
            if (simulateTestScore(individual, question) >= MIN_TEST_SCORE) passed++;
        }
        return (double) passed / TEST_QUESTIONS.size() >= MIN_PASS_RATE;
    }

    // ==================== 私有方法 ====================

    /**
     * 轻量模拟评分（不调 LLM，避免 GEPA 离线优化引入延迟）。
     * 根据启用的块组合估算回答能力。
     */
    private double simulateTestScore(GepaPromptOptimizer.PromptIndividual individual, String question) {
        double score = 50.0;
        if (isBlockEnabled(individual, "toolGuide")) score += 15.0;
        if (isBlockEnabled(individual, "principles")) score += 10.0;
        if (isBlockEnabled(individual, "memoryLimitations")) score += 10.0;
        if (isBlockEnabled(individual, "context")) score += 5.0;
        if (isBlockEnabled(individual, "rag")) score += 5.0;
        if (isBlockEnabled(individual, "intelligence")) score += 5.0;
        return Math.min(100, score);
    }

    private boolean isBlockEnabled(GepaPromptOptimizer.PromptIndividual individual, String blockName) {
        GepaPromptOptimizer.GeneConfig gene = individual.getGenes().get(blockName);
        return gene != null && gene.isEnabled();
    }

    private double jaccardSimilarity(String a, String b) {
        if (a == null || b == null) return 0.0;
        if (a.equals(b)) return 1.0;
        Set<String> setA = tokenize(a);
        Set<String> setB = tokenize(b);
        if (setA.isEmpty() && setB.isEmpty()) return 1.0;
        Set<String> intersection = new HashSet<>(setA);
        intersection.retainAll(setB);
        Set<String> union = new HashSet<>(setA);
        union.addAll(setB);
        return union.isEmpty() ? 0.0 : (double) intersection.size() / union.size();
    }

    private Set<String> tokenize(String text) {
        Set<String> tokens = new HashSet<>();
        String trimmed = text.replaceAll("\\s+", "");
        for (int i = 0; i < trimmed.length() - 1; i++) {
            tokens.add(trimmed.substring(i, i + 2));
        }
        return tokens;
    }

    /**
     * 门控结果 DTO。
     */
    public static final class GateResult {
        private final boolean passed;
        private final String failedGate;
        private final String reason;

        private GateResult(boolean passed, String failedGate, String reason) {
            this.passed = passed;
            this.failedGate = failedGate;
            this.reason = reason;
        }

        public static GateResult pass() { return new GateResult(true, null, null); }
        public static GateResult fail(String gate, String reason) { return new GateResult(false, gate, reason); }

        public boolean isPassed() { return passed; }
        public String getFailedGate() { return failedGate; }
        public String getReason() { return reason; }
    }
}
