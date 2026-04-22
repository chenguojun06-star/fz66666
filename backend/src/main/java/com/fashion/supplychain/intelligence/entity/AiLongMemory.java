package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 长期记忆三层架构
 * <p>FACT(事实) / EPISODIC(过程) / REFLECTIVE(反思)
 * <br>scope: TENANT(租户内复用) / PLATFORM_GLOBAL(跨租户匿名经验)</p>
 */
@Data
@TableName("t_ai_long_memory")
public class AiLongMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String memoryUid;

    /** NULL = 平台全局事实 */
    private Long tenantId;

    /** TENANT / PLATFORM_GLOBAL */
    private String scope;

    /** FACT / EPISODIC / REFLECTIVE */
    private String layer;

    /** customer / supplier / style / factory / process / material */
    private String subjectType;
    private String subjectId;
    private String subjectName;

    private String content;
    private String embeddingId;

    /** 0-100 */
    private BigDecimal confidence;

    private Integer hitCount;
    private LocalDateTime lastHitTime;

    private String sourceSessionId;
    private String sourceUserId;

    private Integer verified;
    private LocalDateTime expireTime;

    private Integer deleteFlag;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
