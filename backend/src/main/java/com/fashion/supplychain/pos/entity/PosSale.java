package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 收银台销售单（POS 开单）。
 *
 * <p>一张单 = 一次出库 + 一次收款（或一条应收）。收款方式只登记，不接真实支付通道。
 */
@Data
@TableName("t_pos_sale")
public class PosSale {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String saleNo;

    private String customerId;

    private String customerName;

    private String customerPhone;

    private Integer itemCount;

    /** 商品金额（折前） */
    private BigDecimal goodsAmount;

    /** 整单折扣金额 */
    private BigDecimal discountAmount;

    /** 抹零金额（正数=少收） */
    private BigDecimal roundOffAmount;

    /** 应收金额 = 商品金额 - 折扣 - 抹零 */
    private BigDecimal totalAmount;

    /** CASH / WECHAT / ALIPAY / CARD / CREDIT(挂账) */
    private String payMethod;

    /** PAID 已收款 / UNPAID 挂账未收 */
    private String payStatus;

    /** 挂账生成的应收单 ID（当场收款为空） */
    private String receivableId;

    private String outstockNo;

    private String remark;

    private String cashier;

    /** NORMAL / VOIDED（作废留痕不删） */
    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
