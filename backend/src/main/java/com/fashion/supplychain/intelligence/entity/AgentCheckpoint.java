package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_checkpoint")
public class AgentCheckpoint {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String threadId;

    private String nodeId;

    private String nodeName;

    private String stateJson;

    private String metadataJson;

    private Integer stepIndex;

    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
