package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceController {

    private final SkillChainExecutionOrchestrator skillChainExecutionOrchestrator;
    private final PendingTaskOrchestrator pendingTaskOrchestrator;
    private final IntelligenceBrainOrchestrator intelligenceBrainOrchestrator;
    private final TenantIntelligenceBrainOrchestrator tenantIntelligenceBrainOrchestrator;
    private final ActionCenterOrchestrator actionCenterOrchestrator;
    private final ActionTaskFeedbackOrchestrator actionTaskFeedbackOrchestrator;
    private final NlQueryOrchestrator nlQueryOrchestrator;
    private final MonthlyBizSummaryOrchestrator monthlyBizSummaryOrchestrator;
    private final ReconciliationAnomalyOrchestrator reconciliationAnomalyOrchestrator;
    private final ApprovalAdvisorOrchestrator approvalAdvisorOrchestrator;
    private final ReplenishmentAdvisorOrchestrator replenishmentAdvisorOrchestrator;

    // ── 技能链 ──
    @GetMapping("/skill-chains")
    public Result<?> listSkillChains() {
        return Result.success(skillChainExecutionOrchestrator.listAvailableSkills());
    }

    // ── 小云待办任务聚合 ──
    @GetMapping("/pending-tasks/my")
    public Result<List<com.fashion.supplychain.intelligence.dto.PendingTaskDTO>> getMyPendingTasks() {
        return Result.success(pendingTaskOrchestrator.getMyPendingTasks());
    }

    @GetMapping("/pending-tasks/summary")
    public Result<com.fashion.supplychain.intelligence.dto.PendingTaskSummaryDTO> getMyPendingTaskSummary() {
        return Result.success(pendingTaskOrchestrator.getMyPendingTaskSummary());
    }


    @GetMapping("/brain/snapshot")
    public Result<IntelligenceBrainSnapshotResponse> getBrainSnapshot() {
        return Result.success(intelligenceBrainOrchestrator.snapshot());
    }

    @GetMapping("/action-center")
    public Result<ActionCenterResponse> getActionCenter() {
        return Result.success(actionCenterOrchestrator.getCenter());
    }

    @PostMapping("/action-center/task-feedback")
    public Result<ActionTaskFeedbackItem> submitActionTaskFeedback(@RequestBody(required = false) ActionTaskFeedbackRequest request) {
        return actionTaskFeedbackOrchestrator.submitFeedback(request);
    }

    @GetMapping("/action-center/task-feedback/list")
    public Result<List<ActionTaskFeedbackItem>> listActionTaskFeedback(@RequestParam(defaultValue = "20") Integer limit) {
        return Result.success(actionTaskFeedbackOrchestrator.listRecent(limit));
    }


    @PostMapping("/nl-query")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "自然语言查询结果由AI生成")
    public Result<NlQueryResponse> nlQuery(@RequestBody NlQueryRequest request) {
        return Result.success(nlQueryOrchestrator.query(request));
    }

    /** 统一大脑快照（整合信号+记忆+AI综合分析的完整视图） */
    @GetMapping("/brain/unified-snapshot")
    public Result<IntelligenceBrainSnapshotResponse> unifiedBrainSnapshot() {
        return Result.success(tenantIntelligenceBrainOrchestrator.unifiedSnapshot());
    }

    /** B5 - 对账异常优先级：扫描挂单对账单，按优先分降序输出异常列表 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/reconciliation/anomaly-priority")
    public Result<ReconciliationAnomalyResponse> reconciliationAnomalyPriority() {
        return Result.success(reconciliationAnomalyOrchestrator.analyze());
    }

    /** B6 - 审批建议：对所有PENDING变更申请给出 APPROVE/REJECT/ESCALATE 建议 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/approval/ai-advice")
    public Result<ApprovalAdvisorResponse> approvalAiAdvice() {
        return Result.success(approvalAdvisorOrchestrator.advise());
    }

    /** B8 - 补料建议：基于缺料预测生成采购优先级与供应商推荐 */
    @GetMapping("/replenishment/suggest")
    public Result<ReplenishmentAdvisorResponse> replenishmentSuggest() {
        return Result.success(replenishmentAdvisorOrchestrator.suggest());
    }

    /** 月度经营汇总：生产完成/次品返修率/各工厂产量/面辅料/成品进出/人工成本/利润
     * 访问规则：平台超管 | 租户主账号(isTenantOwner) | 被显授 INTELLIGENCE_MONTHLY_VIEW 权限的角色 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/monthly-biz-summary")
    public Result<Map<String, Object>> monthlyBizSummary(
            @RequestParam(defaultValue = "0") int year,
            @RequestParam(defaultValue = "0") int month) {
        java.time.LocalDate now = java.time.LocalDate.now();
        int y = year > 0 ? year : now.getYear();
        int m = month > 0 ? month : now.getMonthValue();
        return Result.success(monthlyBizSummaryOrchestrator.getMonthly(y, m));
    }
}
