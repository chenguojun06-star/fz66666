package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 电商赠品规则（Phase 2 订单深加工）
 * 对应 t_ec_gift_rule 表
 */
@Data
@TableName("t_ec_gift_rule")
public class EcGiftRule {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String ruleName;
    private String giftSkuCode;
    private Integer giftQuantity;

    /** 触发类型：AMOUNT按金额/QUANTITY按数量/PLATFORM按平台 */
    private String triggerType;

    /** 触发阈值（金额或数量） */
    private BigDecimal triggerValue;

    /** 触发平台（triggerType=PLATFORM 时） */
    private String triggerPlatform;

    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer enabled;
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
