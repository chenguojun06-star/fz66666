package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 多 Agent 共享记忆实体（五层记忆模型第六章）。
 *
 * <p>同会话内 Sub-Agent 共享事实，避免重复查询和事实冲突。
 * 按 session_id 隔离（同会话内共享，跨会话不共享）。
 *
 * <p>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE。
 */
@Data
@TableName("t_shared_agent_memory")
public class SharedAgentMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0 铁律 4） */
    private Long tenantId;

    /** 会话ID（隔离边界） */
    private String sessionId;

    /** 写入的 Agent：scan_agent / quality_agent / wage_agent */
    private String agentName;

    /** 事实键：order_status / quality_result / ... */
    private String factKey;

    /** 事实值 JSON */
    private String factValue;

    /** 置信度 0-100 */
    private BigDecimal confidence;

    private LocalDateTime createTime;

    /** 过期时间（会话结束后 24h） */
    private LocalDateTime expireTime;
}
