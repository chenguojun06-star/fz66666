package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_background_task")
public class AgentBackgroundTask {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private String taskId;

    private String taskName;

    private String taskType;

    private String status;

    private String priority;

    private String inputParamsJson;

    private String resultJson;

    private String errorMessage;

    private String createdBy;

    private String assigneeUserId;

    private Integer progress;

    private String currentStep;

    private Integer retryCount;

    private Integer maxRetry;

    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    private Integer timeoutSeconds;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
