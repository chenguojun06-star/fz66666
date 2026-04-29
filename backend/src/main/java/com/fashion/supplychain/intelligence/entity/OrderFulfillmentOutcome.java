package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_fulfillment_outcome")
public class OrderFulfillmentOutcome {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderNo;

    private Long snapshotId;

    private LocalDate actualDeliveryDate;

    private LocalDate plannedDeliveryDate;

    private Integer deliveryDelayDays;

    private BigDecimal actualCost;

    private BigDecimal estimatedCost;

    private BigDecimal costVariance;

    private BigDecimal qualityPassRate;

    private String customerSatisfaction;

    private String outcomeSummary;

    private LocalDateTime recordedAt;
}
