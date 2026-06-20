package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.dto.AgentExecutionMetrics;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.helper.XiaoyunPatterns;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.service.SelfCriticService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 自我批评质量门 —— 在最终输出前做 1 轮硬门控（符合 AI Hard Limit ≤1 轮）。
 *
 * <p>借鉴 CL4R1T4S 设计哲学 + Ruflo Truth Scoring + Claude Agent SDK Judge-and-iterate：
 * <ul>
 *   <li>简单场景：单视角评分（SelfCriticService + DataTruthGuard）</li>
 *   <li>高风险场景：4 视角并行批判 + Adversarial Judge Round 2 验证 + 收敛停止</li>
 * </ul>
 *
 * <p>三档决策（阈值不变）：
 * <ul>
 *   <li>PASS：score >= 75 且 DataTruthGuard.overallPassed</li>
 *   <li>SOFT_FAIL：score >= 60 → 加免责声明后输出</li>
 *   <li>HARD_FAIL：score < 60 → 兜底回复</li>
 * </ul>
 *
 * <p>AI Hard Limit 合规：
 * <ul>
 *   <li>多视角是并行 1 轮（不是递归）</li>
 *   <li>Adversarial Judge 是 1 轮 Round 2 验证（不是递归）</li>
 *   <li>总轮数仍 ≤1 轮</li>
 * </ul>
 */
@Component
@Lazy
@Slf4j
public class SelfCritiqueGate {

    @Value("${xiaoyun.self-critic-gate.enabled:${XIAOYUN_SELF_CRITIC_GATE_ENABLED:true}}")
    private boolean enabled;

    private static final double PASS_THRESHOLD = 75.0;
    private static final double SOFT_FAIL_THRESHOLD = 60.0;

    /** 收敛停止条件 Map 清理阈值（超过则清理） */
    private static final int CONVERGENCE_MAP_CLEAN_THRESHOLD = 200;

    @Autowired private SelfCriticService selfCriticService;
    @Autowired private DataTruthGuard dataTruthGuard;
    @Autowired private MultiPerspectiveCritic multiPerspectiveCritic;
    @Autowired private AdversarialJudgePipeline adversarialJudgePipeline;

    /** 按 commandId 隔离的收敛停止条件 */
    private final ConcurrentHashMap<String, ConvergenceStopCondition> convergenceMap = new ConcurrentHashMap<>();

    /**
     * 门控检查。
     */
    public GateResult check(AgentLoopContext ctx, String content) {
        if (!enabled) return GateResult.pass(content, 80.0);

        if (XiaoyunPatterns.shouldSkipCritic(ctx.getUserMessage(),
                ctx.getAllExecRecords().size(), content.length())) {
            return GateResult.pass(content, 80.0);
        }

        try {
            return doCheck(ctx, content);
        } catch (Exception e) {
            log.warn("[SelfCritiqueGate] 检查异常，保守放行: {}", e.getMessage());
            return GateResult.pass(content, 80.0);
        }
    }

    private GateResult doCheck(AgentLoopContext ctx, String content) {
        // 1. 单视角评分（baseScore）
        double baseScore = calculateBaseScore(ctx, content);
        DataTruthGuard.ComprehensiveValidationResult validation =
                dataTruthGuard.comprehensiveValidate(content, ctx.getToolEvidence(), false);
        int trustScore = validation.getTrustScore();
        boolean overallPassed = validation.isOverallPassed();

        // 2. 高风险场景识别
        boolean highRisk = AdversarialJudgePipeline.isHighRiskScenario(ctx);

        if (!highRisk) {
            return decideByScore(ctx, content, baseScore, trustScore, overallPassed, validation, null, null, List.of());
        }

        // 3. 高风险：多视角 + 对抗评审
        MultiPerspectiveCritic.MultiPerspectiveResult multiResult =
                multiPerspectiveCritic.critique(ctx, content);
        AdversarialJudgePipeline.AdversarialJudgeResult judgeResult =
                adversarialJudgePipeline.verify(ctx, content, multiResult);

        double finalScore = Math.min(baseScore,
                Math.min(multiResult.getOverallScore(), judgeResult.getConfidence()));

        // 4. 收敛停止检测
        ConvergenceStopCondition csc = getOrCreateConvergence(ctx.getCommandId());
        csc.recordScore(finalScore);
        if (csc.shouldStop()) {
            log.info("[SelfCritiqueGate] 收敛停止，强制放行 finalScore={}", finalScore);
            return GateResult.pass(content, finalScore, multiResult, judgeResult, collectIssues(multiResult, judgeResult));
        }

        // 5. 汇总问题清单
        List<String> issues = collectIssues(multiResult, judgeResult);

        // 6. 高风险且对抗评审未通过 → 强制降级
        if (!judgeResult.isPassed()) {
            log.warn("[SelfCritiqueGate] 对抗评审未通过 confidence={} → 强制降级", judgeResult.getConfidence());
            return decideByScore(ctx, content, finalScore, trustScore, false, validation,
                    multiResult, judgeResult, issues);
        }

        // 7. 正常三档决策
        return decideByScore(ctx, content, finalScore, trustScore, overallPassed, validation,
                multiResult, judgeResult, issues);
    }

    private double calculateBaseScore(AgentLoopContext ctx, String content) {
        List<String> toolResults = new ArrayList<>();
        for (AiAgentToolExecHelper.ToolExecRecord rec : ctx.getAllExecRecords()) {
            toolResults.add(rec.rawResult != null ? rec.rawResult : "");
        }
        AgentExecutionMetrics metrics = AgentExecutionMetrics.empty();
        metrics.setToolCallCount(ctx.getAllExecRecords().size());
        return selfCriticService.calculateCritiqueScore(
                ctx.getCommandId(), ctx.getUserMessage(), content,
                null, toolResults, metrics, false);
    }

    private GateResult decideByScore(AgentLoopContext ctx, String content, double score,
                                      int trustScore, boolean overallPassed,
                                      DataTruthGuard.ComprehensiveValidationResult validation,
                                      MultiPerspectiveCritic.MultiPerspectiveResult multiResult,
                                      AdversarialJudgePipeline.AdversarialJudgeResult judgeResult,
                                      List<String> issues) {
        if (score >= PASS_THRESHOLD && overallPassed) {
            log.info("[SelfCritiqueGate] PASS score={} trustScore={}", score, trustScore);
            return GateResult.pass(content, score, multiResult, judgeResult, issues);
        }
        if (score >= SOFT_FAIL_THRESHOLD) {
            String disclaimer = buildDisclaimer(score, trustScore, validation, issues);
            log.info("[SelfCritiqueGate] SOFT_FAIL score={} trustScore={}", score, trustScore);
            return GateResult.softFail(content + disclaimer, score, disclaimer, multiResult, judgeResult, issues);
        }
        String fallback = buildFallbackResponse(ctx, score, trustScore, validation);
        log.warn("[SelfCritiqueGate] HARD_FAIL score={} trustScore={}", score, trustScore);
        return GateResult.hardFail(fallback, score, multiResult, judgeResult, issues);
    }

    private List<String> collectIssues(MultiPerspectiveCritic.MultiPerspectiveResult multiResult,
                                        AdversarialJudgePipeline.AdversarialJudgeResult judgeResult) {
        List<String> issues = new ArrayList<>();
        if (multiResult != null && multiResult.getIssues() != null) {
            issues.addAll(multiResult.getIssues());
        }
        if (judgeResult != null && judgeResult.getIssues() != null) {
            issues.addAll(judgeResult.getIssues());
        }
        return issues;
    }

    private ConvergenceStopCondition getOrCreateConvergence(String commandId) {
        if (convergenceMap.size() > CONVERGENCE_MAP_CLEAN_THRESHOLD) {
            cleanupConvergenceMap();
        }
        return convergenceMap.computeIfAbsent(commandId, k -> new ConvergenceStopCondition());
    }

    private void cleanupConvergenceMap() {
        // 简单清理：清空所有记录（commandId 是一次性的，旧记录无意义）
        int size = convergenceMap.size();
        convergenceMap.clear();
        log.info("[SelfCritiqueGate] 清理收敛停止 Map，释放 {} 条记录", size);
    }

    private String buildDisclaimer(double score, int trustScore,
                                    DataTruthGuard.ComprehensiveValidationResult validation,
                                    List<String> issues) {
        StringBuilder sb = new StringBuilder("\n\n> ⚠️ AI 自检提示：");
        sb.append("本次回答可信度评分 ").append(String.format("%.0f", score))
          .append("/100，数据真实性 ").append(trustScore).append("/100。");
        if (validation.getRecommendation() != null && !validation.getRecommendation().isBlank()) {
            sb.append("建议：").append(validation.getRecommendation());
        } else {
            sb.append("建议核对关键数据后再做决策。");
        }
        if (issues != null && !issues.isEmpty()) {
            sb.append("\n> 多视角发现的问题：");
            for (int i = 0; i < Math.min(issues.size(), 5); i++) {
                sb.append("\n> ").append(i + 1).append(". ").append(issues.get(i));
            }
        }
        return sb.toString();
    }

    private String buildFallbackResponse(AgentLoopContext ctx, double score, int trustScore,
                                          DataTruthGuard.ComprehensiveValidationResult validation) {
        StringBuilder sb = new StringBuilder("抱歉，我对这个回答的数据真实性没有足够把握（评分 ");
        sb.append(String.format("%.0f", score)).append("/100）。");
        sb.append("为避免给您错误信息，建议：\n");
        sb.append("- 换种方式描述您的问题（例如明确订单号/款号/日期）\n");
        sb.append("- 或直接在相关页面查看实时数据\n");
        if (ctx.getTenantId() != null) {
            sb.append("- 或联系管理员检查数据源配置\n");
        }
        String toolSummary = ctx.getAllExecRecords().stream()
                .map(r -> r.toolName)
                .filter(n -> n != null && !n.isBlank())
                .distinct()
                .reduce("", (a, b) -> a.isEmpty() ? b : a + "、");
        if (!toolSummary.isEmpty()) {
            sb.append("\n（已尝试查询：").append(toolSummary).append("）");
        }
        return sb.toString();
    }

    // ──────────────────────────────────────────────────────────────

    public static class GateResult {
        private final boolean passed;
        private final String content;
        private final double score;
        private final String disclaimer;
        private final boolean hardFail;
        private final MultiPerspectiveCritic.MultiPerspectiveResult multiPerspective;
        private final AdversarialJudgePipeline.AdversarialJudgeResult adversarialJudge;
        private final List<String> issues;

        private GateResult(boolean passed, String content, double score, String disclaimer,
                           boolean hardFail,
                           MultiPerspectiveCritic.MultiPerspectiveResult multiPerspective,
                           AdversarialJudgePipeline.AdversarialJudgeResult adversarialJudge,
                           List<String> issues) {
            this.passed = passed;
            this.content = content;
            this.score = score;
            this.disclaimer = disclaimer;
            this.hardFail = hardFail;
            this.multiPerspective = multiPerspective;
            this.adversarialJudge = adversarialJudge;
            this.issues = issues == null ? List.of() : List.copyOf(issues);
        }

        public static GateResult pass(String content, double score) {
            return new GateResult(true, content, score, null, false, null, null, List.of());
        }

        public static GateResult pass(String content, double score,
                                       MultiPerspectiveCritic.MultiPerspectiveResult multi,
                                       AdversarialJudgePipeline.AdversarialJudgeResult judge,
                                       List<String> issues) {
            return new GateResult(true, content, score, null, false, multi, judge, issues);
        }

        public static GateResult softFail(String content, double score, String disclaimer) {
            return new GateResult(false, content, score, disclaimer, false, null, null, List.of());
        }

        public static GateResult softFail(String content, double score, String disclaimer,
                                           MultiPerspectiveCritic.MultiPerspectiveResult multi,
                                           AdversarialJudgePipeline.AdversarialJudgeResult judge,
                                           List<String> issues) {
            return new GateResult(false, content, score, disclaimer, false, multi, judge, issues);
        }

        public static GateResult hardFail(String content, double score) {
            return new GateResult(false, content, score, null, true, null, null, List.of());
        }

        public static GateResult hardFail(String content, double score,
                                           MultiPerspectiveCritic.MultiPerspectiveResult multi,
                                           AdversarialJudgePipeline.AdversarialJudgeResult judge,
                                           List<String> issues) {
            return new GateResult(false, content, score, null, true, multi, judge, issues);
        }

        public boolean isPassed() { return passed; }
        public String getContent() { return content; }
        public double getScore() { return score; }
        public String getDisclaimer() { return disclaimer; }
        public boolean isHardFail() { return hardFail; }
        public MultiPerspectiveCritic.MultiPerspectiveResult getMultiPerspective() { return multiPerspective; }
        public AdversarialJudgePipeline.AdversarialJudgeResult getAdversarialJudge() { return adversarialJudge; }
        public List<String> getIssues() { return issues; }
    }
}
