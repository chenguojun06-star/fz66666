package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("t_tenant_ai_usage")
public class TenantAiUsage {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private LocalDate usageDate;
    private String provider;
    private String model;
    private Integer requestCount;
    private Long tokenCount;
    private BigDecimal costAmount;
    private LocalDateTime createdAt;
}