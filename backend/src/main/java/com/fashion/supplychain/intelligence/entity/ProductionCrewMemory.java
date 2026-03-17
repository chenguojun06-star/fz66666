package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 生产Crew记忆持久化实体。
 * 每次 ProductionAgenticCrewOrchestrator 运行产生一条记录，
 * 用于跟踪 AI 对某个订单的决策历史，支持离线分析和复盘。
 */
@Data
@TableName("t_production_crew_memory")
public class ProductionCrewMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 关联的 Crew 会话 ID（UUID，对应 t_crew_session.id）*/
    private String sessionId;

    /** 订单号 */
    private String orderNo;

    /** LLM 生成的行动方案（原始文本）*/
    @TableField("`plan`")
    private String plan;

    /** Critic 修正后或额外动作 JSON（可空）*/
    private String actionJson;

    /** 订单健康分（0-100）*/
    private Integer healthScore;

    /** 健康等级：good / warn / danger */
    private String level;

    /** 路由决策：AUTO_EXECUTED / CRITIC_REVISED / CRITICAL_ALERT / FAILED */
    private String route;

    /** Langfuse trace ID（可空）*/
    private String traceId;

    private LocalDateTime createTime;
}
