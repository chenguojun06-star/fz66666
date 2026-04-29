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
}
