package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_pain_point")
public class IntelligencePainPoint {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String painCode;
    private String painName;
    private String painLevel;
    private String businessDomain;
    private Integer triggerCount;
    private Integer affectedOrderCount;
    private String affectedOrderNos;
    private BigDecimal affectedAmount;
    private LocalDateTime latestTriggerTime;
    private String rootReasonSummary;
    private String currentStatus;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleteFlag;
}
