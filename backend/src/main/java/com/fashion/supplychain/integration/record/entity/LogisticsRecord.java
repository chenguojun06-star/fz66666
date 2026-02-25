package com.fashion.supplychain.integration.record.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 物流运单记录实体
 * 每次下单/查询/取消都会写入/更新一条记录
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_logistics_record")
public class LogisticsRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 业务订单号 */
    private String orderId;

    /** 快递公司编码：SF / STO */
    private String companyCode;

    /** 快递公司名称 */
    private String companyName;

    /** 运单号（下单成功后填入） */
    private String trackingNumber;

    /**
     * 运单状态：
     * CREATED       - 已下单
     * IN_TRANSIT    - 运输中
     * ARRIVED       - 已到达派送站
     * DELIVERED     - 已签收
     * CANCELLED     - 已取消
     * FAILED        - 下单失败
     */
    @Builder.Default
    private String status = "CREATED";

    /** 寄件人信息 */
    private String senderName;
    private String senderPhone;
    private String senderAddress;

    /** 收件人信息 */
    private String receiverName;
    private String receiverPhone;
    private String receiverAddress;

    /** 重量（kg） */
    private BigDecimal weight;

    /** 预估运费（分） */
    private Long estimatedFee;

    /** 实际运费（分，结算后填入） */
    private Long actualFee;

    /** 失败/异常原因 */
    private String errorMessage;

    /** 最新物流事件描述（每次回调推送后更新） */
    private String lastEvent;

    /** 最新物流事件时间 */
    private LocalDateTime lastEventTime;

    /** 签收时间 */
    private LocalDateTime deliveredTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
}
