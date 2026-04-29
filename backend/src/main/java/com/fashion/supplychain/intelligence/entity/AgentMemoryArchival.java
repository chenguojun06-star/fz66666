package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_memory_archival")
public class AgentMemoryArchival {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String agentId;

    private String content;

    private String contentType;

    private Integer accessCount;

    private LocalDateTime lastAccessedAt;

    private Double decayWeight;

    private String embeddingId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
