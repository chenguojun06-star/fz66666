package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ActionCenterResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import org.springframework.stereotype.Service;

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
        return task;
    }

    public IntelligenceBrainSnapshotResponse.BrainAction toBrainAction(ActionCenterResponse.ActionTask task) {
        IntelligenceBrainSnapshotResponse.BrainAction action = new IntelligenceBrainSnapshotResponse.BrainAction();
        action.setActionType(task.getTaskCode());
        action.setPriority(task.getPriority());
        action.setOwnerRole(task.getOwnerRole());
        action.setTitle(task.getTitle());
        action.setSummary(task.getSummary());
        action.setReason(task.getReason() + "；时效要求：" + task.getDueHint());
        action.setRoutePath(task.getRoutePath());
        action.setAutoExecutable(task.isAutoExecutable());
        return action;
    }
}
