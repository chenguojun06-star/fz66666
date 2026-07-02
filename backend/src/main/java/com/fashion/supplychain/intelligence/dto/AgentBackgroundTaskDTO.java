package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AgentBackgroundTaskDTO {

    private String taskId;

    private String taskName;

    private String taskType;

    private String status;

    private String priority;

    private String createdBy;

    private Integer progress;

    private String currentStep;

    private Integer retryCount;

    private Integer maxRetry;

    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    private Integer timeoutSeconds;

    private String errorMessage;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
