package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 分销商档案
 * 对应 t_distributor_profile 表
 * 复用 t_customer 作为客户档案基础（通过 customer_id 关联）
 */
@Data
@TableName("t_distributor_profile")
public class DistributorProfile {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4） */
    private Long tenantId;

    /** 关联 t_customer.id（复用客户档案） */
    private String customerId;

    /** 分销商编号 */
    private String distributorNo;

    /** 分销商名称 */
    private String distributorName;

    /** 等级编码（关联 t_distributor_level.level_code） */
    private String distributorLevel;

    /** 联系人 */
    private String contactPerson;

    /** 联系电话 */
    private String contactPhone;

    /** 地址 */
    private String address;

    /** 结算周期：CASH/MONTHLY/QUARTERLY */
    private String settlementCycle;

    /** 信用额度 */
    private BigDecimal creditLimit;

    /** 已用额度 */
    private BigDecimal usedCredit;

    /** 状态：ACTIVE/INACTIVE/FROZEN */
    private String status;

    /** 备注 */
    private String remark;

    /** 软删除 */
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String creatorId;
    private String creatorName;
}
