package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_memory")
public class IntelligenceMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** case / knowledge / preference */
    private String memoryType;

    private String memoryCode;

    /** 业务域 production / finance / warehouse */
    private String businessDomain;

    private String title;

    private String content;

    /** Qdrant 中的向量点 ID */
    private String embeddingId;

    /** 租户偏好摘要 JSON */
    private String tenantPreference;

    private Integer recallCount;

    private Integer adoptedCount;

    /** 最近一次 Qdrant 相似度分数 */
    private BigDecimal relevanceScore;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
