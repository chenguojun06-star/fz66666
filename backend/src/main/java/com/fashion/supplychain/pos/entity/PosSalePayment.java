package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * POS 销售单组合支付明细（一笔单多种方式混收）。
 *
 * <p>每种收款方式一行；单方式收款也落一行，让「按方式汇总 / 交班对账」
 * 只认这一张表，不用再从 sale.pay_method 反推。
 */
@Data
@TableName("t_pos_sale_payment")
public class PosSalePayment {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 销售单 ID（t_pos_sale.id） */
    private Long saleId;

    /** CASH / WECHAT / ALIPAY / CARD / CREDIT / MEMBER_BALANCE */
    private String payMethod;

    /** 该方式实收金额（现金存应收纳金额，找零不入库） */
    private BigDecimal amount;

    /** 渠道交易号（在线渠道对账用） */
    private String channelTradeNo;

    private String remark;

    private LocalDateTime createTime;
}
