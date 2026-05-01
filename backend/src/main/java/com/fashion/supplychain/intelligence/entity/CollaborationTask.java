package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_collaboration_task")
public class CollaborationTask {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderNo;

    private String targetRole;

    private String currentStage;

    private String nextStep;

    private String instruction;

    private String dueHint;

    private String dispatchResponseJson;

    private LocalDateTime updatedAt;

    private LocalDateTime dueAt;

    private Boolean overdue;

    private LocalDateTime createdAt;

    private String taskStatus;

    private String priority;

    private String assigneeName;

    private String acceptanceCriteria;

    private LocalDateTime escalatedAt;

    private String escalatedTo;

    private String sourceType;

    private String sourceInstruction;

    private String completionNote;

    private LocalDateTime completedAt;

    public enum TaskStatus {
        PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, ESCALATED, CANCELLED
    }

    public enum Priority {
        CRITICAL, HIGH, MEDIUM, LOW
    }

    public enum SourceType {
        AI_DISPATCH, MANUAL, CREW_MEETING, PATROL
    }
}
