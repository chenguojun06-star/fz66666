package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_session")
public class AgentSession {
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private Long tenantId;
    private String userId;
    private String status;
    private String userMessage;
    private String finalAnswer;
    private Integer totalTokens;
    private Integer totalIterations;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
