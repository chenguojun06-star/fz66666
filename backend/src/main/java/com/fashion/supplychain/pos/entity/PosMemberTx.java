package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 会员储值 / 消费流水。
 *
 * <p><b>这张表是余额的唯一可信来源</b>：会员表上的 {@code balance} 只是快照，
 * 对账时以流水的 {@code balanceAfter} 为准。余额只允许"读快照 + 原子扣减"，
 * 不允许业务代码直接 set 余额。
 */
@Data
@TableName("t_pos_member_tx")
public class PosMemberTx {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;

    private String memberId;

    /** RECHARGE 充值 / CONSUME 消费 / REFUND 退款 / ADJUST 人工调整 */
    private String type;

    private BigDecimal amount;

    private BigDecimal balanceAfter;

    private String saleNo;

    private String bizNo;

    private String operatorId;

    private String operatorName;

    private String remark;

    private LocalDateTime createTime;
}
