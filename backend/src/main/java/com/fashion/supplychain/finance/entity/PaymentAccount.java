package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 收款账户实体
 * 员工/工厂绑定的收款方式（银行卡/微信/支付宝二维码）
 */
@Data
@TableName("t_payment_account")
public class PaymentAccount {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 账户所有者类型: WORKER=员工, FACTORY=工厂 */
    private String ownerType;

    /** 所有者ID（关联t_user.id或t_factory.id） */
    private String ownerId;

    /** 所有者名称（冗余，便于查询） */
    private String ownerName;

    /** 账户类型: BANK=银行卡, WECHAT=微信, ALIPAY=支付宝 */
    private String accountType;

    /** 收款户名 */
    private String accountName;

    /** 银行卡号（银行卡类型必填） */
    private String accountNo;

    /** 开户银行 */
    private String bankName;

    /** 开户支行 */
    private String bankBranch;

    /** 收款二维码图片URL（微信/支付宝） */
    private String qrCodeUrl;

    /** 是否默认账户: 0=否, 1=是 */
    private Integer isDefault;

    /** 状态: active=启用, inactive=停用 */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
}
