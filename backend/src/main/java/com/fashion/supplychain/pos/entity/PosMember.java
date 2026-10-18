package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * POS 会员档案。
 *
 * <p>挂在 {@code t_customer} 之上，不另建客户档案 —— 客户资料只能有一份，
 * 否则两套电话两套地址，对账时根本说不清哪条是同一个人。
 *
 * <p>折扣存 {@code discountRate}（0.90 = 九折）而不是"会员价"字段：
 * 存死价格意味着每次调价都要批量刷会员数据，既刷不干净也追不回来。
 */
@Data
@TableName("t_pos_member")
public class PosMember {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    private String customerId;

    private String phone;

    private String memberNo;

    private String name;

    private String levelCode;

    /** 折扣率：1.00 不打折，0.90 九折。最小 0.01，最大 1.00。 */
    private BigDecimal discountRate;

    /** 储值余额。所有变更走 PosMemberTx 流水 + 原子扣减，不允许直接改。 */
    private BigDecimal balance;

    private BigDecimal totalRecharge;

    private BigDecimal totalSpend;

    private Integer points;

    private String status;

    private String remark;

    private String creatorId;

    private String creatorName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
