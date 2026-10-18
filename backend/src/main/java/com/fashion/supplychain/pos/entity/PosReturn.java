package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-816：POS 退货/换货单头。
 *
 * <p><b>为什么必须有</b>：核实发现收银台原本只有「取消未支付订单」，
 * <b>付了钱的单退不了</b>。门店卖错一件衣服就没有任何补救路径 ——
 * 这是专业收银台最硬的缺口。
 *
 * <p><b>退款为什么是「待人工确认」</b>：本系统未接支付渠道的退款接口。
 * 若在此自动标记「已退款」就是假成功 —— 钱根本没到顾客账上，
 * 而系统显示已退（CLAUDE.md：禁止桩实现混入主干、禁止把缺失兜底成成功）。
 * 因此退款动作由收银员在线下真实退款后确认。
 */
@Data
@TableName("t_pos_return")
public class PosReturn {

    private String id;
    private Long tenantId;
    private String returnNo;
    /** 原销售单号 */
    private String saleNo;
    private Long saleId;
    private String customerId;
    private String customerName;
    private String customerPhone;
    /** REFUND 仅退款 / RETURN 退货退款 / EXCHANGE 换货 */
    private String returnType;
    /** 换货生成的新销售单号 */
    private String exchangePosSaleNo;
    private Integer itemCount;
    private BigDecimal goodsAmount;
    private BigDecimal discountAmount;
    private BigDecimal totalAmount;
    /** 原支付方式，退款据此外路进行 */
    private String payMethod;
    /** PENDING 待退款 / REFUNDED 已退款 */
    private String refundStatus;
    private BigDecimal refundedAmount;
    private LocalDateTime refundTime;
    private String refundBy;
    private String reason;
    /** 库存是否已回退：避免重复回退把库存加两次 */
    private Integer stockReturned;
    private String remark;
    private Integer deleteFlag;
    private String creatorId;
    private String creatorName;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
