package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 工资支付记录实体
 * 每次支付的完整记录（支持线上/线下多种支付方式）
 */
@Data
@TableName("t_wage_payment")
public class WagePayment {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 支付单号（WP+日期+序号） */
    private String paymentNo;

    /** 收款方类型: WORKER=员工, FACTORY=工厂 */
    private String payeeType;

    /** 收款方ID */
    private String payeeId;

    /** 收款方名称 */
    private String payeeName;

    /** 关联的收款账户ID */
    private String paymentAccountId;

    /** 支付方式: OFFLINE=线下, BANK=银行卡, WECHAT=微信, ALIPAY=支付宝 */
    private String paymentMethod;

    /** 支付金额 */
    private BigDecimal amount;

    /** 币种 */
    private String currency;

    // ---- 业务关联 ----

    /** 业务类型: PAYROLL=工资, RECONCILIATION=对账结算, REIMBURSEMENT=报销 */
    private String bizType;

    /** 关联业务ID */
    private String bizId;

    /** 关联业务单号 */
    private String bizNo;

    // ---- 支付信息 ----

    /** 状态: pending=待支付, processing=支付中, success=已支付, failed=支付失败, cancelled=已取消 */
    private String status;

    /** 实际支付时间 */
    private LocalDateTime paymentTime;

    /** 支付凭证图片URL */
    private String paymentProof;

    /** 支付备注 */
    private String paymentRemark;

    // ---- 线上支付信息 ----

    /** 第三方支付单号 */
    private String thirdPartyOrderId;

    /** 第三方支付状态 */
    private String thirdPartyStatus;

    // ---- 操作信息 ----

    /** 操作人ID */
    private String operatorId;

    /** 操作人名称 */
    private String operatorName;

    /** 确认收款时间 */
    private LocalDateTime confirmTime;

    /** 确认人（收款方确认） */
    private String confirmBy;

    // ---- 通知信息 ----

    /** 通知状态: pending=待通知, sent=已通知, failed=通知失败 */
    private String notifyStatus;

    /** 通知时间 */
    private LocalDateTime notifyTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
