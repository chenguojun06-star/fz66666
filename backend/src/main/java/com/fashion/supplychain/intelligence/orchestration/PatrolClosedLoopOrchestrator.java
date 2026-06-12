package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.mapper.AiPatrolActionMapper;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 涓诲姩宸℃闂幆缂栨帓鍣? * <p>宸℃鍙戠幇 鈫?寤鸿 鈫?瀹℃壒/鑷姩鎵ц 鈫?鍏抽棴锛岀粺璁?MTTR銆傜鎴峰唴鍙鑷韩璁板綍锛? * 瓒呯鑱氬悎 MTTR/issue 鍒嗗竷浣滀负骞冲彴鎶ゅ煄娌炽€?/p>
 */
@Slf4j
@Service
@Lazy
public class PatrolClosedLoopOrchestrator {

    @Autowired
    private AiPatrolActionMapper actionMapper;

    @Autowired(required = false)
    private SmartEscalationOrchestrator smartEscalation;

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

        recordEscalationLearning(actionId);
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

        recordEscalationLearning(actionId);
    }

    private void recordEscalationLearning(Long actionId) {
        if (smartEscalation == null) return;
        try {
            AiPatrolAction action = actionMapper.selectById(actionId);
            if (action == null || action.getCreateTime() == null) return;

            long resolutionMins = Duration.between(action.getCreateTime(), LocalDateTime.now()).toMinutes();
            if (resolutionMins < 0) resolutionMins = 0;

            String escalationLevel = mapRiskToEscalation(action.getRiskLevel());
            smartEscalation.recordOutcome(escalationLevel, resolutionMins);
        } catch (Exception e) {
            log.debug("[PatrolClosedLoop] 鍗囩骇瀛︿範璁板綍澶辫触: {}", e.getMessage());
        }
    }

    private String mapRiskToEscalation(String riskLevel) {
        if (riskLevel == null) return "L1";
        return switch (riskLevel) {
            case "AUTO_EXECUTE", "LOW" -> "L1";
            case "MEDIUM" -> "L2";
            case "HIGH", "NEED_APPROVAL" -> "L3";
            default -> "L1";
        };
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
     * 骞冲彴瓒呯锛歁TTR 鑱氬悎
     */
    public List<Map<String, Object>> aggregateMttr(LocalDateTime since) {
        return actionMapper.aggregateMttrByIssueType(since);
    }

    public List<AiPatrolAction> listByTarget(Long tenantId, String targetType, String targetId, int limit) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        if (targetType != null && !targetType.isBlank()) w.eq(AiPatrolAction::getTargetType, targetType);
        if (targetId != null && !targetId.isBlank()) w.eq(AiPatrolAction::getTargetId, targetId);
        w.in(AiPatrolAction::getStatus, "PENDING", "APPROVED", "AUTO_RUNNING");
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 50));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> listRecentByTenant(Long tenantId, int limit) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.orderByDesc(AiPatrolAction::getId).last("LIMIT " + Math.min(Math.max(limit, 1), 50));
        return actionMapper.selectList(w);
    }

    public List<AiPatrolAction> listPendingAutoExecute() {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        w.eq(AiPatrolAction::getStatus, "PENDING")
         .eq(AiPatrolAction::getRiskLevel, "AUTO_EXECUTE");
        return actionMapper.selectList(w);
    }

    public void markAutoRunning(Long actionId) {
        AiPatrolAction a = new AiPatrolAction();
        a.setId(actionId);
        a.setStatus("AUTO_RUNNING");
        a.setUpdateTime(LocalDateTime.now());
        actionMapper.updateById(a);
    }

    public int countPendingByTenant(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "PENDING");
        return Math.toIntExact(actionMapper.selectCount(w));
    }

    public int countAutoExecutedToday(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "AUTO_EXECUTED")
         .ge(AiPatrolAction::getExecutionTime, LocalDate.now().atStartOfDay());
        return Math.toIntExact(actionMapper.selectCount(w));
    }

    public int countHighRiskPending(Long tenantId) {
        LambdaQueryWrapper<AiPatrolAction> w = new LambdaQueryWrapper<>();
        if (tenantId != null) w.eq(AiPatrolAction::getTenantId, tenantId);
        w.eq(AiPatrolAction::getStatus, "PENDING")
         .eq(AiPatrolAction::getRiskLevel, "NEED_APPROVAL");
        return Math.toIntExact(actionMapper.selectCount(w));
    }
}
