package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 分销商价格政策
 * 对应 t_distributor_price_policy 表
 * 三种类型：FIXED（固定价）/ DISCOUNT（折扣）/ TIERED（阶梯）
 */
@Data
@TableName("t_distributor_price_policy")
public class DistributorPricePolicy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4） */
    private Long tenantId;

    /** 策略名称 */
    private String policyName;

    /** 策略类型：FIXED/DISCOUNT/TIERED */
    private String policyType;

    /** 适用等级（NULL=全部） */
    private String distributorLevel;

    /** 适用SKU（NULL=全部） */
    private String skuCode;

    /** 供货价 */
    private BigDecimal supplyPrice;

    /** 最低零售价（限价） */
    private BigDecimal minRetailPrice;

    /** 阶梯价JSON：[{minQty,maxQty,price}] */
    private String tierJson;

    /** 生效开始 */
    private LocalDateTime effectiveFrom;

    /** 生效结束 */
    private LocalDateTime effectiveTo;

    /** 是否启用 */
    private Integer enabled;

    /** 软删除 */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
