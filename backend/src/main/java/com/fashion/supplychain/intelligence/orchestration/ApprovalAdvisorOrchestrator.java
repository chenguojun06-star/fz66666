package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ApprovalAdvisorResponse;
import com.fashion.supplychain.intelligence.dto.ApprovalAdvisorResponse.ApprovalAdvice;
import com.fashion.supplychain.system.entity.ChangeApproval;
import com.fashion.supplychain.system.mapper.ChangeApprovalMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * B6 - 审批建议 AI 编排器
 * 对所有挂起中（PENDING）的变更申请单，结合操作类型、挂起时长，
 * 给出 APPROVE / REJECT / ESCALATE 智能建议及风险等级。
 */
@Service
@Slf4j
public class ApprovalAdvisorOrchestrator {

    /** 操作类型风险权重 */
    private static final Map<String, Double> RISK_WEIGHT = Map.of(
            "ORDER_DELETE",   3.0,
            "ORDER_MODIFY",   2.0,
            "STYLE_DELETE",   2.5,
            "SAMPLE_DELETE",  1.5,
            "SCAN_UNDO",      1.0
    );

    @Autowired
    private ChangeApprovalMapper changeApprovalMapper;

    public ApprovalAdvisorResponse advise() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime now = LocalDateTime.now();

        QueryWrapper<ChangeApproval> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("status", "PENDING")
                .eq("delete_flag", 0)
                .orderByAsc("apply_time");
        List<ChangeApproval> approvals = changeApprovalMapper.selectList(qw);

        List<ApprovalAdvice> items = new ArrayList<>();
        int highRisk = 0;
        for (ChangeApproval a : approvals) {
            ApprovalAdvice advice = buildAdvice(a, now);
            items.add(advice);
            if ("high".equals(advice.getRiskLevel())) highRisk++;
        }

        // 按优先分降序
        items.sort((x, y) -> Double.compare(y.getPriorityScore(), x.getPriorityScore()));

        ApprovalAdvisorResponse resp = new ApprovalAdvisorResponse();
        resp.setPendingCount(approvals.size());
        resp.setHighRiskCount(highRisk);
        resp.setItems(items);
        log.debug("[ApprovalAdvisor] tenantId={} pending={} highRisk={}",
                tenantId, approvals.size(), highRisk);
        return resp;
    }

    private ApprovalAdvice buildAdvice(ChangeApproval a, LocalDateTime now) {
        int pendingHours = (int) ChronoUnit.HOURS.between(
                a.getApplyTime() != null ? a.getApplyTime() : now, now);
        if (pendingHours < 0) pendingHours = 0;

        String opType = a.getOperationType() != null ? a.getOperationType() : "UNKNOWN";
        double baseWeight = RISK_WEIGHT.getOrDefault(opType, 1.0);

        // 风险等级
        String riskLevel;
        if (baseWeight >= 3.0 || pendingHours >= 48) {
            riskLevel = "high";
        } else if (baseWeight >= 2.0 || pendingHours >= 24) {
            riskLevel = "medium";
        } else {
            riskLevel = "low";
        }

        // AI 建议逻辑
        String verdict;
        String reason;
        String applyReason = a.getApplyReason() != null ? a.getApplyReason() : "";

        if ("ORDER_DELETE".equals(opType) && pendingHours < 2) {
            verdict = "ESCALATE";
            reason = "订单删除操作风险极高，建议上级主管亲自审批";
        } else if ("ORDER_DELETE".equals(opType)) {
            verdict = "ESCALATE";
            reason = String.format("订单删除挂起 %d 小时，需主管确认后方可操作", pendingHours);
        } else if ("SCAN_UNDO".equals(opType) && pendingHours <= 1) {
            verdict = "APPROVE";
            reason = "扫码撤回申请在1小时内，理由合理，建议直接批准";
        } else if ("SCAN_UNDO".equals(opType) && pendingHours > 24) {
            verdict = "REJECT";
            reason = "扫码撤回挂起超24小时，撤回时效性不足，建议驳回";
        } else if ("ORDER_MODIFY".equals(opType) && applyReason.length() < 10) {
            verdict = "REJECT";
            reason = "订单修改申请理由过于简短，信息不完整，建议要求补充说明";
        } else if (pendingHours >= 72) {
            verdict = "ESCALATE";
            reason = String.format("申请挂起已超72小时，建议上级介入尽快处理");
        } else {
            verdict = "APPROVE";
            reason = String.format("%s 申请，挂起 %d 小时，信息完整，可批准", opType, pendingHours);
        }

        // 优先分 = 风险权重 × log(挂起小时+1) × 100
        double score = baseWeight * Math.log(pendingHours + 1 + 1) * 100;
        if ("ESCALATE".equals(verdict)) score *= 1.5;

        ApprovalAdvice advice = new ApprovalAdvice();
        advice.setApprovalId(a.getId());
        advice.setOperationType(opType);
        advice.setTargetNo(a.getTargetNo());
        advice.setApplicantName(a.getApplicantName());
        advice.setOrgUnitName(a.getOrgUnitName());
        advice.setApplyReason(applyReason);
        advice.setApplyTime(a.getApplyTime() != null ? a.getApplyTime().toString() : "");
        advice.setPendingHours(pendingHours);
        advice.setVerdict(verdict);
        advice.setVerdictReason(reason);
        advice.setRiskLevel(riskLevel);
        advice.setPriorityScore(Math.round(score * 100.0) / 100.0);
        return advice;
    }
}
