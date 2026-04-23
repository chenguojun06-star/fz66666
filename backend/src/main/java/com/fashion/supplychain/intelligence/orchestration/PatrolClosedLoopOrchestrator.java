package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.mapper.AiPatrolActionMapper;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 主动巡检闭环编排器
 * <p>巡检发现 → 建议 → 审批/自动执行 → 关闭，统计 MTTR。租户内可见自身记录，
 * 超管聚合 MTTR/issue 分布作为平台护城河。</p>
 */
@Slf4j
@Service
public class PatrolClosedLoopOrchestrator {

    @Autowired
    private AiPatrolActionMapper actionMapper;

    public AiPatrolAction createAction(String patrolSource, String detectedIssue, String issueType,
                                       String issueSeverity, String targetType, String targetId,
                                       String suggestedActionJson, BigDecimal confidence,
                                       String riskLevel) {
        AiPatrolAction a = new AiPatrolAction();
        a.setActionUid(UUID.randomUUID().toString().replace("-", ""));
        a.setTenantId(UserContext.tenantId());
        a.setPatrolSource(patrolSource);
        a.setDetectedIssue(detectedIssue);
        a.setIssueType(issueType);
        a.setIssueSeverity(issueSeverity);
        a.setTargetType(targetType);
        a.setTargetId(targetId);
        a.setSuggestedActionJson(suggestedActionJson);
        a.setConfidence(confidence);
        a.setRiskLevel(riskLevel == null ? "NEED_APPROVAL" : riskLevel);
        a.setStatus("PENDING");
        a.setAutoExecuted(0);
        a.setCreateTime(LocalDateTime.now());
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.insert(a);
        return a;
    }

    public void approve(Long actionId, String approverId, String approverName, String remark) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("APPROVED");
        a.setApproverId(approverId);
        a.setApproverName(approverName);
        a.setApprovalTime(LocalDateTime.now());
        a.setApprovalRemark(remark);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public void reject(Long actionId, String approverId, String approverName, String remark) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("REJECTED");
        a.setApproverId(approverId);
        a.setApproverName(approverName);
        a.setApprovalTime(LocalDateTime.now());
        a.setApprovalRemark(remark);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public void markExecuted(Long actionId, boolean autoExecuted, String executionResult,
                             String linkedAuditId) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus(autoExecuted ? "AUTO_EXECUTED" : "EXECUTED");
        a.setAutoExecuted(autoExecuted ? 1 : 0);
        a.setExecutionResult(executionResult);
        a.setExecutionTime(LocalDateTime.now());
        a.setLinkedAuditId(linkedAuditId);
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public void close(Long actionId) {
        AiPatrolAction existing = actionMapper.selectById(actionId);
        if (existing == null) return;
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("CLOSED");
        a.setCloseTime(LocalDateTime.now());
        if (existing.getCreateTime() != null) {
            long mins = Duration.between(existing.getCreateTime(), LocalDateTime.now()).toMinutes();
            a.setMttrMinutes((int) Math.max(0L, mins));
        }
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public List<AiPatrolAction> recentForCurrentTenant(int limit) {
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tid != null) w.eq(AiPatrolAction::getTenantId, tid);
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 200));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> recentActions(int hours) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        w.ge(AiPatrolAction::getCreateTime, LocalDateTime.now().minusHours(hours))
         .orderByDesc(AiPatrolAction::getId)
         .last("LIMIT 500");
        return actionMapper.selectList(w);
    }

    /**
     * 平台超管：MTTR 聚合
     */
    public List<Map<String, Object>> aggregateMttr(LocalDateTime since) {
        return actionMapper.aggregateMttrByIssueType(since);
    }
}
