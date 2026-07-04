package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 分销商等级
 * 对应 t_distributor_level 表
 */
@Data
@TableName("t_distributor_level")
public class DistributorLevel {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4） */
    private Long tenantId;

    /** 等级编码（如 VIP/A/B/C） */
    private String levelCode;

    /** 等级名称 */
    private String levelName;

    /** 默认折扣率（0-100） */
    private java.math.BigDecimal defaultDiscount;

    /** 升级门槛（累计采购额） */
    private java.math.BigDecimal minPurchaseAmount;

    /** 排序 */
    private Integer sortOrder;

    /** 是否启用：1=启用 0=禁用 */
    private Integer enabled;

    /** 软删除 */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
