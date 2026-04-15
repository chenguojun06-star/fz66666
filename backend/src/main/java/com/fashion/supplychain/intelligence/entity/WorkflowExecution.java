package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_workflow_execution")
public class WorkflowExecution {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private Long tenantId;
    private String userId;
    private String workflowId;
    private String status;
    private String currentNodeId;
    private String contextJson;
    private String resultJson;
    private String errorMessage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
