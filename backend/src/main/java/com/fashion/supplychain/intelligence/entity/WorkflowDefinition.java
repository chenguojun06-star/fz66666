package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_workflow_definition")
public class WorkflowDefinition {
    @TableId(type = IdType.ASSIGN_ID)
    private String id;
    private Long tenantId;
    private String name;
    private String description;
    private String dagJson;
    private Integer version;
    private Integer enabled;
    private Integer deleteFlag;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
