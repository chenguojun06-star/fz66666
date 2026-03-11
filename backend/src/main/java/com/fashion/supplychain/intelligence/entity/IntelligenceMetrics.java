package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 调用度量记录
 */
@Data
@TableName("t_intelligence_metrics")
public class IntelligenceMetrics {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 调用场景（nl_query / predict / anomaly 等） */
    private String scene;

    /** AI提供商 */
    private String provider;

    /** 模型名称 */
    private String model;

    private Boolean success;

    private Boolean fallbackUsed;

    /** 调用耗时（毫秒） */
    private Integer latencyMs;

    private Integer promptChars;

    private Integer responseChars;

    private String errorMessage;

    private String userId;

    private LocalDateTime createTime;

    private Integer deleteFlag;
}
