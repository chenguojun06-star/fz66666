package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper.ToolExecRecord;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 对抗式评审管线 —— 借鉴 Claude Agent SDK Judge-and-iterate 模式。
 *
 * <p>仅高风险场景启动 Round 2 验证。Round 2 用规则验证 Round 1 问题是否真正解决
 * （不调 LLM，避免延迟）。
 *
 * <p>高风险场景识别（HighRiskDetector）：
 * <ul>
 *   <li>用户消息含：工资/结算/删除/批量/入库/撤回</li>
 *   <li>工具调用含 HIGH_RISK 工具</li>
 *   <li>工具调用数 ≥5</li>
 * </ul>
 *
 * <p>AI Hard Limit 合规：Round 2 是 1 轮验证（不是递归重做）。
 */
@Component
@Lazy
@Slf4j
public class AdversarialJudgePipeline {

    /** 高风险用户消息关键词 */
    private static final Set<String> HIGH_RISK_USER_KEYWORDS = Set.of(
            "工资", "结算", "删除", "批量", "入库", "撤回", "审批", "关单", "转厂", "出库"
    );

    /** 高风险工具调用数阈值 */
    private static final int HIGH_RISK_TOOL_COUNT_THRESHOLD = 5;

    /** 承诺词模式（需工具证据支撑） */
    private static final Pattern COMMITMENT_PATTERN = Pattern.compile(
            "(已确认|已验证|已校验|已检查|已核对|已审批|已结算|已执行|已完成|已删除|已撤回|已入库|已出库)"
    );

    /** Round 2 验证通过阈值 */
    private static final double PASS_THRESHOLD = 70.0;

    /**
     * 高风险场景识别（HighRiskDetector）。
     *
     * <p>满足以下任一条件即视为高风险：
     * <ul>
     *   <li>用户消息含高风险关键词</li>
     *   <li>工具调用含 HIGH_RISK 工具</li>
     *   <li>工具调用数 ≥5</li>
     * </ul>
     */
    public static boolean isHighRiskScenario(AgentLoopContext ctx) {
        if (ctx == null) return false;

        // 条件1：用户消息含高风险关键词
        String userMessage = ctx.getUserMessage();
        if (userMessage != null) {
            for (String kw : HIGH_RISK_USER_KEYWORDS) {
                if (userMessage.contains(kw)) return true;
            }
        }

        List<ToolExecRecord> records = ctx.getAllExecRecords();

        // 条件2：工具调用含 HIGH_RISK 工具
        for (ToolExecRecord rec : records) {
            if (rec.toolName != null && AiAgentToolAccessService.isHighRisk(rec.toolName)) {
                return true;
            }
        }

        // 条件3：工具调用数 ≥5
        return records.size() >= HIGH_RISK_TOOL_COUNT_THRESHOLD;
    }

    /**
     * Round 2 对抗式验证。
     *
     * @param ctx     AgentLoop 上下文
     * @param content 待输出的回答
     * @param round1  Round 1（MultiPerspectiveCritic）的结果
     * @return 对抗评审结果（passed / issues / confidence）
     */
    public AdversarialJudgeResult verify(AgentLoopContext ctx, String content,
                                          MultiPerspectiveCritic.MultiPerspectiveResult round1) {
        List<String> issues = new ArrayList<>();

        // 检查1：Round 1 发现的问题是否在回答中解决
        checkRound1IssuesResolved(round1, content, issues);

        // 检查2：承诺词无工具证据支撑
        checkCommitmentWithoutEvidence(ctx, content, issues);

        // 检查3：工具执行结果与回答一致性
        checkToolExecutionConsistency(ctx, content, issues);

        // 计算置信度
        double confidence = computeConfidence(round1, issues);

        boolean passed = issues.isEmpty() && confidence >= PASS_THRESHOLD;

        log.info("[AdversarialJudge] passed={} confidence={} issues={}", passed, confidence, issues.size());

        return new AdversarialJudgeResult(passed, List.copyOf(issues), confidence);
    }

    // ── 检查1：Round 1 问题是否解决 ──────────────────────────────

    private void checkRound1IssuesResolved(MultiPerspectiveCritic.MultiPerspectiveResult round1,
                                            String content, List<String> issues) {
        if (round1 == null || round1.getIssues() == null) return;
        if (content == null) return;

        for (String round1Issue : round1.getIssues()) {
            if (!isIssueAddressed(round1Issue, content)) {
                issues.add("Round 1 问题未解决：" + round1Issue);
            }
        }
    }

    private boolean isIssueAddressed(String issue, String content) {
        // 多租户泄露问题：回答中必须不再出现泄露关键词
        if (issue.contains("跨租户泄露")) {
            return !content.contains("其他工厂") && !content.contains("其他租户")
                    && !content.contains("别的工厂") && !content.contains("别家工厂");
        }
        // 权限合规问题：回答中应包含"已确认"或工具证据
        if (issue.contains("未确认")) {
            return content.contains("已确认") || content.contains("需要确认") || content.contains("请确认");
        }
        // 数据真实性问题：回答中应包含数据来源标注
        if (issue.contains("数据真实性") || issue.contains("逻辑矛盾")) {
            return content.contains("数据来源") || content.contains("根据") || content.contains("查询结果");
        }
        // 业务正确性问题：回答中应包含用户问题核心词
        if (issue.contains("业务正确性")) {
            return content.length() > 50; // 简化：回答足够长视为已展开
        }
        return true;
    }

    // ── 检查2：承诺词无工具证据 ──────────────────────────────────

    private void checkCommitmentWithoutEvidence(AgentLoopContext ctx, String content, List<String> issues) {
        if (content == null || content.isBlank()) return;

        if (!COMMITMENT_PATTERN.matcher(content).find()) return;

        List<ToolExecRecord> records = ctx.getAllExecRecords();
        if (records.isEmpty()) {
            issues.add("对抗评审：回答含承诺词但无任何工具调用");
            return;
        }

        // 检查是否有成功的工具执行结果
        boolean hasSuccessTool = records.stream()
                .anyMatch(r -> r.rawResult != null
                        && (r.rawResult.contains("\"success\":true") || r.rawResult.contains("\"success\": true")));
        if (!hasSuccessTool) {
            issues.add("对抗评审：回答含承诺词但无成功的工具执行记录");
        }
    }

    // ── 检查3：工具执行与回答一致性 ──────────────────────────────

    private void checkToolExecutionConsistency(AgentLoopContext ctx, String content, List<String> issues) {
        if (content == null) return;
        List<ToolExecRecord> records = ctx.getAllExecRecords();

        // 检查：回答声称执行了某操作，但工具记录中无对应工具
        if (content.contains("已删除") && !hasToolCalled(records, "delete", "remove", "undo")) {
            issues.add("对抗评审：回答声称已删除但无删除类工具调用");
        }
        if (content.contains("已结算") && !hasToolCalled(records, "payroll", "finance", "settle")) {
            issues.add("对抗评审：回答声称已结算但无结算类工具调用");
        }
        if (content.contains("已入库") && !hasToolCalled(records, "inbound", "warehouse", "receive")) {
            issues.add("对抗评审：回答声称已入库但无入库类工具调用");
        }
    }

    private boolean hasToolCalled(List<ToolExecRecord> records, String... keywords) {
        for (ToolExecRecord rec : records) {
            if (rec.toolName == null) continue;
            String lower = rec.toolName.toLowerCase();
            for (String kw : keywords) {
                if (lower.contains(kw)) return true;
            }
        }
        return false;
    }

    // ── 置信度计算 ──────────────────────────────────────────────

    private double computeConfidence(MultiPerspectiveCritic.MultiPerspectiveResult round1, List<String> issues) {
        double base = 100.0;
        if (round1 != null) {
            base = round1.getOverallScore();
        }
        // 每个未解决问题扣 10 分
        base -= issues.size() * 10.0;
        return Math.max(0, Math.min(100, base));
    }

    // ── 结果类 ──────────────────────────────────────────────────

    /**
     * 对抗评审结果。
     */
    public static class AdversarialJudgeResult {
        private final boolean passed;
        private final List<String> issues;
        private final double confidence;

        public AdversarialJudgeResult(boolean passed, List<String> issues, double confidence) {
            this.passed = passed;
            this.issues = issues;
            this.confidence = confidence;
        }

        public boolean isPassed() { return passed; }
        public List<String> getIssues() { return issues; }
        public double getConfidence() { return confidence; }
    }
}
