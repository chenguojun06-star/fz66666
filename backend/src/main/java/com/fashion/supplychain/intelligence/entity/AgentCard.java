package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_card")
public class AgentCard {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String agentId;

    private String agentName;

    private String description;

    private String skillsJson;

    private String inputTypesJson;

    private String outputTypesJson;

    private String endpointUrl;

    private String protocol;

    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
