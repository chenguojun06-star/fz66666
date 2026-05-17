package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.LocalDateTime;

@Data
@Accessors(chain = true)
@TableName("t_ai_task_tracker")
public class AiTaskTracker {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String taskSourceTool;

    private String taskType;

    private String targetType;

    private String targetId;

    private String taskSummary;

    private String status;

    private String assignedTo;

    private LocalDateTime createdAt;

    private LocalDateTime completedAt;

    private String resultSummary;
}