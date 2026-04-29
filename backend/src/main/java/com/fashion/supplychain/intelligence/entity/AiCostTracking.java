package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_ai_cost_tracking")
public class AiCostTracking {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String modelName;

    private String scene;

    private Integer promptTokens;

    private Integer completionTokens;

    private Integer totalTokens;

    private BigDecimal estimatedCostUsd;

    private Integer latencyMs;

    private Boolean success;

    private String errorMessage;

    private LocalDateTime createdAt;
}
