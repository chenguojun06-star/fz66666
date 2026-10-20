package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * POS 批发阶梯价（租户级）。
 *
 * <p>当前按「单条配置」使用（满 N 件打 X 折）；唯一键 tenant+min_qty
 * 保留了多档阶梯的扩展能力。折扣以**整单折扣金额**落地：
 * 折扣 = 商品金额 × (1 − discount_rate)，不改逐行单价，
 * 避免与会员价/手工改价互相污染。
 */
@Data
@TableName("t_pos_wholesale_tier")
public class PosWholesaleTier {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 满多少件可用批发价 */
    private Integer minQty;

    /** 折扣率 0.90 = 九折 */
    private BigDecimal discountRate;

    /** 1 启用 / 0 停用 */
    private Integer enabled;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
