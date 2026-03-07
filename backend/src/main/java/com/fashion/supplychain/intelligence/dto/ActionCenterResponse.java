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
    }

    @Data
    public static class ActionTask {
        private String taskCode;
        private String domain;
        private String priority;
        private String escalationLevel;
        private String ownerRole;
        private String title;
        private String summary;
        private String reason;
        private String routePath;
        private String relatedOrderNo;
        private String dueHint;
        private boolean autoExecutable;
    }
}
