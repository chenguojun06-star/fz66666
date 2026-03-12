package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ActionCenterResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 跟进任务编排器。
 *
 * <p>职责：把风险信号统一转换为动作中心任务与大脑动作。</p>
 */
@Service
public class FollowupTaskOrchestrator {

    public ActionCenterResponse.ActionTask buildTask(String taskCode,
                                                     String domain,
                                                     String priority,
                                                     String escalationLevel,
                                                     String ownerRole,
                                                     String title,
                                                     String summary,
                                                     String reason,
                                                     String routePath,
                                                     String relatedOrderNo,
                                                     String dueHint,
                                                     boolean autoExecutable) {
        ActionCenterResponse.ActionTask task = new ActionCenterResponse.ActionTask();
        task.setTaskCode(taskCode);
        task.setDomain(domain);
        task.setPriority(priority);
        task.setEscalationLevel(escalationLevel);
        task.setOwnerRole(ownerRole);
        task.setTitle(title);
        task.setSummary(summary);
        task.setReason(reason);
        task.setRoutePath(routePath);
        task.setRelatedOrderNo(relatedOrderNo);
        task.setDueHint(dueHint);
        task.setAutoExecutable(autoExecutable);
        task.setOwnerAction(buildOwnerAction(ownerRole, title));
        task.setCompletionCheck(buildCompletionCheck(domain, relatedOrderNo));
        task.setExpectedOutcome(buildExpectedOutcome(priority, escalationLevel));
        task.setNextReviewAt(buildNextReviewAt(escalationLevel));
        task.setSourceSignal(taskCode);
        return task;
    }

    public IntelligenceBrainSnapshotResponse.BrainAction toBrainAction(ActionCenterResponse.ActionTask task) {
        IntelligenceBrainSnapshotResponse.BrainAction action = new IntelligenceBrainSnapshotResponse.BrainAction();
        action.setActionType(task.getTaskCode());
        action.setPriority(task.getPriority());
        action.setOwnerRole(task.getOwnerRole());
        action.setTitle(task.getTitle());
        action.setSummary(task.getSummary());
        action.setReason(task.getReason() + "；负责人动作：" + task.getOwnerAction() + "；验收：" + task.getCompletionCheck() + "；时效要求：" + task.getDueHint());
        action.setRoutePath(task.getRoutePath());
        action.setAutoExecutable(task.isAutoExecutable());
        return action;
    }

    private String buildOwnerAction(String ownerRole, String title) {
        if (ownerRole == null || ownerRole.isBlank()) {
            return "负责人确认任务并推进执行";
        }
        return ownerRole + "负责推进：" + title;
    }

    private String buildCompletionCheck(String domain, String relatedOrderNo) {
        if ("finance".equalsIgnoreCase(domain)) {
            return "财务异常项状态变更为已处理，并记录处理意见";
        }
        if ("factory".equalsIgnoreCase(domain)) {
            return "工厂停滞或节拍异常恢复，近30分钟出现有效进度反馈";
        }
        if (relatedOrderNo != null && !relatedOrderNo.isBlank()) {
            return "订单" + relatedOrderNo + "风险等级下降或进度恢复";
        }
        return "任务处理结论已回写并可复核";
    }

    private String buildExpectedOutcome(String priority, String escalationLevel) {
        if ("high".equalsIgnoreCase(priority) || "L3".equalsIgnoreCase(escalationLevel)) {
            return "优先止住风险扩散，避免交期或成本继续恶化";
        }
        if ("medium".equalsIgnoreCase(priority) || "L2".equalsIgnoreCase(escalationLevel)) {
            return "在当日内压降关键风险并恢复协同节奏";
        }
        return "保持运行稳定，减少后续异常触发概率";
    }

    private String buildNextReviewAt(String escalationLevel) {
        LocalDateTime reviewAt = switch (escalationLevel == null ? "" : escalationLevel.toUpperCase()) {
            case "L3" -> LocalDateTime.now().plusHours(1);
            case "L2" -> LocalDateTime.now().plusHours(4);
            default -> LocalDateTime.now().plusHours(24);
        };
        return reviewAt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }
}
