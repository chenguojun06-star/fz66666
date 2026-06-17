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

/**
 * 自我批评质量门 —— 在最终输出前做 1 轮硬门控（符合 AI Hard Limit ≤1 轮）。
 *
 * <p>借鉴 CL4R1T4S 设计哲学：把"评分"升级为"门控"——不达标则降级输出，而非照输出。
 *
 * <p>三档决策：
 * <ul>
 *   <li>PASS：score >= PASS_THRESHOLD 且 DataTruthGuard.overallPassed → 直接通过</li>
 *   <li>SOFT_FAIL：score >= SOFT_FAIL_THRESHOLD → 加免责声明后输出</li>
 *   <li>HARD_FAIL：score < SOFT_FAIL_THRESHOLD → 兜底回复 + 提示换种方式提问</li>
 * </ul>
 *
 * <p>简单场景（短问候/工具少+回答短）跳过 Gate，避免无意义评分。
 */
@Component
@Lazy
@Slf4j
public class SelfCritiqueGate {

    @Value("${xiaoyun.self-critic-gate.enabled:${XIAOYUN_SELF_CRITIC_GATE_ENABLED:true}}")
    private boolean enabled;

    /** 通过阈值（复用 SelfCriticService.SELF_IMPROVE_THRESHOLD） */
    private static final double PASS_THRESHOLD = 75.0;
    /** 软失败阈值（复用 DataTruthGuard L1 trustLevel 阈值） */
    private static final double SOFT_FAIL_THRESHOLD = 60.0;

    @Autowired
    private SelfCriticService selfCriticService;

    @Autowired
    private DataTruthGuard dataTruthGuard;

    /**
     * 门控检查。
     *
     * @param ctx      AgentLoop 上下文
     * @param content  待输出的回答（Critic 改写 + 证据卡片追加后）
     * @return 门控结果（可能 pass / softFail / hardFail）
     */
    public GateResult check(AgentLoopContext ctx, String content) {
        if (!enabled) {
            return GateResult.pass(content, 80.0);
        }

        // 简单场景跳过（复用 shouldSkipCritic，避免无意义评分）
        if (XiaoyunPatterns.shouldSkipCritic(ctx.getUserMessage(),
                ctx.getAllExecRecords().size(), content.length())) {
            return GateResult.pass(content, 80.0);
        }

        try {
            // 1. 复用 SelfCriticService 同步评分（0-100，7 维加权）
            List<String> toolResults = new ArrayList<>();
            for (AiAgentToolExecHelper.ToolExecRecord rec : ctx.getAllExecRecords()) {
                toolResults.add(rec.rawResult != null ? rec.rawResult : "");
            }
            AgentExecutionMetrics metrics = AgentExecutionMetrics.empty();
            metrics.setToolCallCount(ctx.getAllExecRecords().size());

            double score = selfCriticService.calculateCritiqueScore(
                    ctx.getCommandId(), ctx.getUserMessage(), content,
                    null, toolResults, metrics, false);

            // 2. 复用 DataTruthGuard 综合验证（trustScore 0-100）
            DataTruthGuard.ComprehensiveValidationResult validation =
                    dataTruthGuard.comprehensiveValidate(content, ctx.getToolEvidence(), false);
            int trustScore = validation.getTrustScore();
            boolean overallPassed = validation.isOverallPassed();

            // 3. 三档决策（≤1 轮，不递归重做）
            if (score >= PASS_THRESHOLD && overallPassed) {
                log.info("[SelfCritiqueGate] PASS score={} trustScore={}", score, trustScore);
                return GateResult.pass(content, score);
            } else if (score >= SOFT_FAIL_THRESHOLD) {
                String disclaimer = buildDisclaimer(score, trustScore, validation);
                log.info("[SelfCritiqueGate] SOFT_FAIL score={} trustScore={} — 加免责声明", score, trustScore);
                return GateResult.softFail(content + disclaimer, score, disclaimer);
            } else {
                String fallback = buildFallbackResponse(ctx, score, trustScore, validation);
                log.warn("[SelfCritiqueGate] HARD_FAIL score={} trustScore={} — 使用兜底回复", score, trustScore);
                return GateResult.hardFail(fallback, score);
            }
        } catch (Exception e) {
            log.warn("[SelfCritiqueGate] 检查异常，保守放行: {}", e.getMessage());
            return GateResult.pass(content, 80.0);
        }
    }

    private String buildDisclaimer(double score, int trustScore,
                                    DataTruthGuard.ComprehensiveValidationResult validation) {
        StringBuilder sb = new StringBuilder("\n\n> ⚠️ AI 自检提示：");
        sb.append("本次回答可信度评分 ").append(String.format("%.0f", score))
          .append("/100，数据真实性 ").append(trustScore).append("/100。");
        if (validation.getRecommendation() != null && !validation.getRecommendation().isBlank()) {
            sb.append("建议：").append(validation.getRecommendation());
        } else {
            sb.append("建议核对关键数据后再做决策。");
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

        private GateResult(boolean passed, String content, double score,
                           String disclaimer, boolean hardFail) {
            this.passed = passed;
            this.content = content;
            this.score = score;
            this.disclaimer = disclaimer;
            this.hardFail = hardFail;
        }

        public static GateResult pass(String content, double score) {
            return new GateResult(true, content, score, null, false);
        }

        public static GateResult softFail(String content, double score, String disclaimer) {
            return new GateResult(false, content, score, disclaimer, false);
        }

        public static GateResult hardFail(String content, double score) {
            return new GateResult(false, content, score, null, true);
        }

        public boolean isPassed() { return passed; }
        public String getContent() { return content; }
        public double getScore() { return score; }
        public String getDisclaimer() { return disclaimer; }
        public boolean isHardFail() { return hardFail; }
    }
}
