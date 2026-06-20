package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper.ToolExecRecord;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 多视角并行批判 —— 借鉴 Ruflo Truth Scoring + 2026 Quality Gate 多视角模式。
 *
 * <p>4 视角并行（规则+启发式，不调 LLM，避免延迟）：
 * <ol>
 *   <li>业务正确性（BusinessCorrectness）：工具调用是否匹配用户意图</li>
 *   <li>数据真实性（DataTruth）：复用 DataTruthGuard 综合验证</li>
 *   <li>多租户安全（TenantSecurity）：工具调用是否带 tenant_id、回答是否泄露其他租户</li>
 *   <li>权限合规（PermissionCompliance）：HIGH_RISK 工具是否经过确认、是否拆分绕过</li>
 * </ol>
 *
 * <p>综合分 = 加权平均（30/30/25/15），任一视角 0 分 → 综合分 0（一票否决）。
 *
 * <p>AI Hard Limit 合规：多视角是并行 1 轮（不是递归）。
 */
@Component
@Lazy
@Slf4j
public class MultiPerspectiveCritic {

    /** 业务正确性权重 */
    private static final double W_BUSINESS = 0.30;
    /** 数据真实性权重 */
    private static final double W_DATA_TRUTH = 0.30;
    /** 多租户安全权重 */
    private static final double W_TENANT = 0.25;
    /** 权限合规权重 */
    private static final double W_PERMISSION = 0.15;

    /** 一票否决阈值：任一视角低于此值则综合分直接 0 */
    private static final double VETO_THRESHOLD = 1.0;

    /** 跨租户泄露关键词（出现即视为泄露风险） */
    private static final Set<String> CROSS_TENANT_LEAK_KEYWORDS = Set.of(
            "其他工厂", "其他租户", "别的工厂", "别家工厂", "其他公司", "别的公司"
    );

    /** 承诺词（需工具证据支撑，否则扣分） */
    private static final Pattern COMMITMENT_PATTERN = Pattern.compile(
            "(已确认|已验证|已校验|已检查|已核对|已审批|已结算|已执行|已完成)"
    );

    @Autowired
    private DataTruthGuard dataTruthGuard;

    /**
     * 多视角并行批判。
     *
     * @param ctx     AgentLoop 上下文
     * @param content 待输出的回答
     * @return 多视角评分结果（含 4 视角评分 + 综合分 + 问题清单）
     */
    public MultiPerspectiveResult critique(AgentLoopContext ctx, String content) {
        List<String> issues = new ArrayList<>();

        PerspectiveScore business = evaluateBusinessCorrectness(ctx, content, issues);
        PerspectiveScore dataTruth = evaluateDataTruth(ctx, content, issues);
        PerspectiveScore tenant = evaluateTenantSecurity(ctx, content, issues);
        PerspectiveScore permission = evaluatePermissionCompliance(ctx, content, issues);

        double overall = computeOverallScore(business, dataTruth, tenant, permission);

        log.info("[MultiPerspective] business={} dataTruth={} tenant={} permission={} overall={} issues={}",
                business.score, dataTruth.score, tenant.score, permission.score, overall, issues.size());

        return new MultiPerspectiveResult(
                business.score, dataTruth.score, tenant.score, permission.score,
                overall, List.copyOf(issues));
    }

    // ── 视角1：业务正确性 ──────────────────────────────────────────

    private PerspectiveScore evaluateBusinessCorrectness(AgentLoopContext ctx, String content, List<String> issues) {
        String userMessage = ctx.getUserMessage();
        List<ToolExecRecord> records = ctx.getAllExecRecords();

        double score = 100.0;

        // 检查1：工具调用是否匹配用户意图
        if (userMessage != null && !records.isEmpty()) {
            boolean intentMatched = checkIntentToolMatch(userMessage, records);
            if (!intentMatched) {
                score -= 25.0;
                issues.add("业务正确性：工具调用与用户意图不匹配");
            }
        }

        // 检查2：回答是否包含用户问题的核心要素
        if (userMessage != null && content != null) {
            boolean coreAddressed = checkCoreAddressed(userMessage, content);
            if (!coreAddressed) {
                score -= 20.0;
                issues.add("业务正确性：回答未覆盖用户问题核心要素");
            }
        }

        // 检查3：承诺词无工具证据支撑
        if (content != null && COMMITMENT_PATTERN.matcher(content).find()) {
            if (records.isEmpty() || records.stream().allMatch(r -> r.rawResult == null || r.rawResult.contains("\"error\""))) {
                score -= 30.0;
                issues.add("业务正确性：回答含承诺词但无工具证据支撑");
            }
        }

        return new PerspectiveScore(clamp(score), "business");
    }

    private boolean checkIntentToolMatch(String userMessage, List<ToolExecRecord> records) {
        String lower = userMessage.toLowerCase();
        for (ToolExecRecord rec : records) {
            String toolName = rec.toolName == null ? "" : rec.toolName.toLowerCase();
            if (isToolMatchIntent(lower, toolName)) return true;
        }
        return false;
    }

    private boolean isToolMatchIntent(String userLower, String toolName) {
        if (userLower.contains("订单") && toolName.contains("order")) return true;
        if (userLower.contains("工资") && (toolName.contains("payroll") || toolName.contains("finance"))) return true;
        if (userLower.contains("库存") && (toolName.contains("stock") || toolName.contains("warehouse"))) return true;
        if (userLower.contains("款式") && toolName.contains("style")) return true;
        if (userLower.contains("样衣") && toolName.contains("sample")) return true;
        if (userLower.contains("物料") && toolName.contains("material")) return true;
        if (userLower.contains("生产") && toolName.contains("production")) return true;
        if (userLower.contains("扫码") && toolName.contains("scan")) return true;
        if (userLower.contains("入库") && toolName.contains("inbound")) return true;
        if (userLower.contains("质检") && toolName.contains("quality")) return true;
        return false;
    }

    private boolean checkCoreAddressed(String userMessage, String content) {
        String lowerUser = userMessage.toLowerCase();
        String lowerContent = content.toLowerCase();
        // 简化：检查用户消息中的关键业务词是否在回答中出现
        String[] keywords = {"订单", "工资", "库存", "款式", "样衣", "物料", "生产", "扫码", "入库", "质检", "工厂", "进度"};
        int matched = 0;
        int total = 0;
        for (String kw : keywords) {
            if (lowerUser.contains(kw)) {
                total++;
                if (lowerContent.contains(kw)) matched++;
            }
        }
        if (total == 0) return true; // 用户消息无业务关键词，不强制
        return matched >= total / 2.0;
    }

    // ── 视角2：数据真实性 ──────────────────────────────────────────

    private PerspectiveScore evaluateDataTruth(AgentLoopContext ctx, String content, List<String> issues) {
        try {
            DataTruthGuard.ComprehensiveValidationResult validation =
                    dataTruthGuard.comprehensiveValidate(content, ctx.getToolEvidence(), false);
            double score = validation.getTrustScore();
            if (!validation.isOverallPassed()) {
                issues.add("数据真实性：综合验证未通过（trustScore=" + validation.getTrustScore() + "）");
            }
            if (validation.getLogicIssues() != null && !validation.getLogicIssues().isEmpty()) {
                issues.add("数据真实性：存在逻辑矛盾（" + validation.getLogicIssues().size() + "处）");
            }
            return new PerspectiveScore(clamp(score), "dataTruth");
        } catch (Exception e) {
            log.warn("[MultiPerspective] 数据真实性评估异常: {}", e.getMessage());
            return new PerspectiveScore(70.0, "dataTruth");
        }
    }

    // ── 视角3：多租户安全 ──────────────────────────────────────────

    private PerspectiveScore evaluateTenantSecurity(AgentLoopContext ctx, String content, List<String> issues) {
        double score = 100.0;
        Long tenantId = ctx.getTenantId();

        // 检查1：tenantId 必须存在
        if (tenantId == null || tenantId <= 0) {
            score = 0.0;
            issues.add("多租户安全：上下文缺失 tenantId（P0 风险）");
            return new PerspectiveScore(score, "tenant");
        }

        // 检查2：工具调用记录是否带 tenant_id（从 evidence/rawResult 检测）
        List<ToolExecRecord> records = ctx.getAllExecRecords();
        int missingTenantCount = 0;
        for (ToolExecRecord rec : records) {
            if (!hasTenantMarker(rec)) {
                missingTenantCount++;
            }
        }
        if (!records.isEmpty() && missingTenantCount > 0) {
            double ratio = (double) missingTenantCount / records.size();
            score -= ratio * 40.0;
            if (ratio > 0.5) {
                issues.add("多租户安全：超过半数工具调用记录无 tenant_id 标记");
            }
        }

        // 检查3：回答是否泄露其他租户信息
        if (content != null) {
            for (String kw : CROSS_TENANT_LEAK_KEYWORDS) {
                if (content.contains(kw)) {
                    score = 0.0;
                    issues.add("多租户安全：回答含跨租户泄露关键词「" + kw + "」（P0 一票否决）");
                    break;
                }
            }
        }

        return new PerspectiveScore(clamp(score), "tenant");
    }

    private boolean hasTenantMarker(ToolExecRecord rec) {
        if (rec == null) return true;
        // evidence 或 rawResult 中包含 tenant_id 标记即视为合规
        String evidence = rec.evidence == null ? "" : rec.evidence;
        String raw = rec.rawResult == null ? "" : rec.rawResult;
        return evidence.contains("tenant") || raw.contains("tenant")
                || evidence.contains("租户") || raw.contains("租户")
                || evidence.contains("工厂") || raw.contains("工厂");
    }

    // ── 视角4：权限合规 ──────────────────────────────────────────

    private PerspectiveScore evaluatePermissionCompliance(AgentLoopContext ctx, String content, List<String> issues) {
        double score = 100.0;
        List<ToolExecRecord> records = ctx.getAllExecRecords();

        int highRiskCount = 0;
        int unconfirmedCount = 0;
        int splitOpCount = 0;

        for (ToolExecRecord rec : records) {
            if (rec.toolName == null) continue;
            if (AiAgentToolAccessService.isHighRisk(rec.toolName)) {
                highRiskCount++;
                if (!isConfirmed(rec)) {
                    unconfirmedCount++;
                }
                if (isSplitOperation(rec, records)) {
                    splitOpCount++;
                }
            }
        }

        if (highRiskCount > 0) {
            // 未确认的 HIGH_RISK 工具调用
            if (unconfirmedCount > 0) {
                score -= 50.0 * unconfirmedCount / highRiskCount;
                issues.add("权限合规：" + unconfirmedCount + " 个 HIGH_RISK 工具调用未确认");
            }
            // 拆分操作绕过确认
            if (splitOpCount > 0) {
                score -= 30.0;
                issues.add("权限合规：检测到疑似拆分操作绕过确认");
            }
        }

        // 检查回答是否声称执行了 HIGH_RISK 操作但无对应工具记录
        if (content != null && highRiskCount == 0) {
            if (content.contains("已删除") || content.contains("已批量") || content.contains("已结算")) {
                score -= 40.0;
                issues.add("权限合规：回答声称执行高风险操作但无对应工具记录");
            }
        }

        return new PerspectiveScore(clamp(score), "permission");
    }

    private boolean isConfirmed(ToolExecRecord rec) {
        if (rec.rawResult == null) return false;
        // 工具结果中含 needsConfirmation=true 表示尚未确认
        if (rec.rawResult.contains("\"needsConfirmation\":true")) return false;
        if (rec.rawResult.contains("\"needsConfirmation\": true")) return false;
        // 含 success=true 或已执行标记视为已确认
        return rec.rawResult.contains("\"success\":true") || rec.rawResult.contains("\"success\": true")
                || rec.rawResult.contains("已执行") || rec.rawResult.contains("已完成");
    }

    private boolean isSplitOperation(ToolExecRecord rec, List<ToolExecRecord> allRecords) {
        // 简化检测：同一工具在短时间内被多次调用（参数不同），可能是拆分操作
        if (rec.toolName == null) return false;
        long sameToolCount = allRecords.stream()
                .filter(r -> rec.toolName.equals(r.toolName))
                .count();
        // HIGH_RISK 工具被调用 3 次以上视为疑似拆分
        return sameToolCount >= 3 && AiAgentToolAccessService.isHighRisk(rec.toolName);
    }

    // ── 综合分计算 ──────────────────────────────────────────────

    private double computeOverallScore(PerspectiveScore business, PerspectiveScore dataTruth,
                                        PerspectiveScore tenant, PerspectiveScore permission) {
        // 一票否决：任一视角 0 分（或低于 VETO_THRESHOLD）→ 综合分直接 0
        if (business.score < VETO_THRESHOLD) return 0.0;
        if (dataTruth.score < VETO_THRESHOLD) return 0.0;
        if (tenant.score < VETO_THRESHOLD) return 0.0;
        if (permission.score < VETO_THRESHOLD) return 0.0;

        return business.score * W_BUSINESS
                + dataTruth.score * W_DATA_TRUTH
                + tenant.score * W_TENANT
                + permission.score * W_PERMISSION;
    }

    private double clamp(double score) {
        return Math.max(0, Math.min(100, score));
    }

    // ── 内部数据结构 ──────────────────────────────────────────────

    private record PerspectiveScore(double score, String name) {}

    /**
     * 多视角批判结果。
     */
    public static class MultiPerspectiveResult {
        private final double businessScore;
        private final double dataTruthScore;
        private final double tenantSecurityScore;
        private final double permissionComplianceScore;
        private final double overallScore;
        private final List<String> issues;

        public MultiPerspectiveResult(double businessScore, double dataTruthScore,
                                       double tenantSecurityScore, double permissionComplianceScore,
                                       double overallScore, List<String> issues) {
            this.businessScore = businessScore;
            this.dataTruthScore = dataTruthScore;
            this.tenantSecurityScore = tenantSecurityScore;
            this.permissionComplianceScore = permissionComplianceScore;
            this.overallScore = overallScore;
            this.issues = issues;
        }

        public double getBusinessScore() { return businessScore; }
        public double getDataTruthScore() { return dataTruthScore; }
        public double getTenantSecurityScore() { return tenantSecurityScore; }
        public double getPermissionComplianceScore() { return permissionComplianceScore; }
        public double getOverallScore() { return overallScore; }
        public List<String> getIssues() { return issues; }

        public boolean hasVeto() {
            return overallScore < VETO_THRESHOLD;
        }
    }
}
