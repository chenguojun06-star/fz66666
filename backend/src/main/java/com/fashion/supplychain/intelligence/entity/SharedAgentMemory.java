package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 多Agent共享记忆（同会话内共享）
 *
 * <p>用途：同会话内 Sub-Agent 共享"任务进度/已发现事实/团队决策"，避免重复查询和事实冲突</p>
 *
 * <p>来源：参考 five-layer-memory-design.md 第六章（AWS S3 Vectors 多 Agent 协作方向）</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@TableName("t_shared_agent_memory")
public class SharedAgentMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 会话ID（隔离边界） */
    private String sessionId;

    /** Agent名称：scan_agent/quality_agent/wage_agent/... */
    private String agentName;

    /** 事实键：order_status/quality_result/... */
    private String factKey;

    /** 事实值JSON */
    private String factValue;

    /** 置信度0-100 */
    private BigDecimal confidence;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 会话结束后 24h 过期 */
    private LocalDateTime expireTime;
}
