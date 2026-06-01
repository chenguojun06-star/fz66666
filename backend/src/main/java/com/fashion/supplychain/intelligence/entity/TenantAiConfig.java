package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_tenant_ai_config")
public class TenantAiConfig {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;

    private String textProvider;
    @JsonIgnore
    private String textApiKey;
    private String textBaseUrl;
    private String textModel;

    private String visionProvider;
    @JsonIgnore
    private String visionApiKey;
    private String visionBaseUrl;
    private String visionModel;

    private BigDecimal monthlyBudget;
    private Integer rateLimitRpm;
    private Integer aiEnabled;
    private String configSource;

    private Integer deleteFlag;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public boolean isAiActive() {
        return aiEnabled != null && aiEnabled == 1;
    }

    public boolean checkAiEnabled() {
        return isAiActive();
    }

    public boolean hasOwnApiKey() {
        return "tenant".equals(configSource) && textApiKey != null && !textApiKey.isBlank();
    }

    public boolean isPlatformProvisioned() {
        return "platform".equals(configSource);
    }

    public boolean isTrial() {
        return "trial".equals(configSource);
    }
}