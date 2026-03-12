package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 动作中心响应。
 *
 * <p>用于把多域风险转为可执行任务，供驾驶舱和后续待办中心统一消费。</p>
 */
@Data
public class ActionCenterResponse {

    private Summary summary = new Summary();
    private List<ActionTask> tasks = new ArrayList<>();

    @Data
    public static class Summary {
        private int totalTasks;
        private int highPriorityTasks;
        private int productionTasks;
        private int financeTasks;
        private int factoryTasks;
        private int processingTasks;
        private int completedTasks;
        private int rejectedTasks;
        private int overdueReviewTasks;
        private int closureRate;
        private int adoptionRate;
    }

    @Data
    public static class ActionTask {
        private String taskCode;
        private String domain;
        private String priority;
        private String escalationLevel;
        private Integer coordinationScore;
        private String ownerRole;
        private String title;
        private String summary;
        private String reason;
        private String ownerAction;
        private String completionCheck;
        private String expectedOutcome;
        private String nextReviewAt;
        private String sourceSignal;
        private String feedbackStatus;
        private String feedbackReason;
        private String completionNote;
        private String feedbackTime;
        private String routePath;
        private String relatedOrderNo;
        private String dueHint;
        private boolean autoExecutable;
    }
}
