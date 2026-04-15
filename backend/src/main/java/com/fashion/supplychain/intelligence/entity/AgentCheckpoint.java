package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_agent_checkpoint")
public class AgentCheckpoint {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String sessionId;
    private Integer iteration;
    private String messagesJson;
    private String toolCallsJson;
    private Integer totalTokens;
    private LocalDateTime createdAt;
}
