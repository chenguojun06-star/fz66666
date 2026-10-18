package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-817：交接班 / 钱箱。
 *
 * <p>补的是「多店员时钱对不上、不知道谁经手、交完班还能改数」这个缺口。
 *
 * <p><b>钱箱口径刻意保守</b>：只有 CASH 进钱箱。微信/支付宝是线上收到商户账户、
 * 刷卡走 POS 对账单、挂账根本不是收款 —— 把它们算进钱箱必然对不平。
 */
@Data
@TableName("t_pos_shift")
public class PosShift {

    private String id;
    private Long tenantId;
    private String shiftNo;
    private String cashierId;
    private String cashierName;
    private String terminal;
    /** 开班备用金：钱箱初始金额 */
    private BigDecimal openingCash;

    private Integer saleCount;
    private Integer saleItemCount;
    /** 本班现金收款（只有 CASH 进钱箱） */
    private BigDecimal cashSaleAmount;
    private BigDecimal onlineSaleAmount;
    private BigDecimal cardSaleAmount;
    private BigDecimal creditAmount;
    /** 本班现金退款（退货时从钱箱拿现金给顾客） */
    private BigDecimal refundCashAmount;

    /** 应有钱箱 = 备用金 + 现金收款 − 现金退款 */
    private BigDecimal expectedCash;
    /** 实点现金（交班时收银员填写） */
    private BigDecimal actualCash;
    /** 差异 = 实点 − 应有（长款正 / 短款负） */
    private BigDecimal diffAmount;
    private String diffReason;

    /** OPEN 上班中 / CLOSED 已交班 */
    private String status;
    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    private String remark;
    private String creatorId;
    private String creatorName;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
