package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 账单汇总实体 — 统一收付款账单聚合
 * 所有模块审批通过后推送到此表，替代原有查询时聚合
 */
@Data
@TableName("t_bill_aggregation")
public class BillAggregation {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 账单编号 BA+日期+序号 */
    private String billNo;

    /** PAYABLE=应付, RECEIVABLE=应收 */
    private String billType;

    /** MATERIAL / PRODUCT / EXTERNAL_FACTORY / PAYROLL / EXPENSE / SHIPMENT / DEDUCTION */
    private String billCategory;

    /** 来源类型 */
    private String sourceType;
    private String sourceId;
    private String sourceNo;

    /** 对方信息 */
    private String counterpartyType;
    private String counterpartyId;
    private String counterpartyName;

    /** 关联订单 */
    private String orderId;
    private String orderNo;
    private String styleNo;

    /** 金额 */
    private BigDecimal amount;
    private BigDecimal settledAmount;

    /** PENDING / CONFIRMED / SETTLING / SETTLED / CANCELLED */
    private String status;

    /** 结算月份 yyyy-MM */
    private String settlementMonth;

    private String remark;

    private String confirmedById;
    private String confirmedByName;
    private LocalDateTime confirmedAt;

    private String settledById;
    private String settledByName;
    private LocalDateTime settledAt;

    private String creatorId;
    private String creatorName;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Long tenantId;
    private Integer deleteFlag;
}
