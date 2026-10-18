package com.fashion.supplychain.pos.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-817：收银台挂单（暂存购物车）。
 *
 * <p><b>不是财务单据</b>：挂单不进任何账、不产生应收、不参与统计，
 * 取回时只是把购物车还原。因此刻意用 JSON 快照而不是单头+单行两张表 ——
 * 否则「暂存」和「单据」会在同一个模型里混，日后统计口径必然被污染。
 * 真单据请走 {@code t_pos_sale}。
 */
@Data
@TableName("t_pos_hold")
public class PosHold {

    private String id;
    private Long tenantId;
    private String holdNo;
    private String customerId;
    private String customerName;
    private String customerPhone;
    /** 购物车快照（JSON 数组）：行 / 数量 / 单价 / 折扣 */
    private String cartJson;
    private Integer itemCount;
    private BigDecimal goodsAmount;
    private BigDecimal discountAmount;
    /** 预选支付方式，取回后保留，省一次点击 */
    private String payMethod;
    private String remark;
    /** HELD 挂起中 / RESUMED 已取回 / DISCARDED 已丢弃 */
    private String status;
    private LocalDateTime resumedTime;
    private String creatorId;
    private String creatorName;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
