package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Accessors(chain = true)
@TableName("t_intelligence_delivery_risk")
public class DeliveryRiskItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long orderId;
    private String orderNo;
    private String styleName;
    private String customerName;
    private LocalDate deliveryDate;
    private LocalDate predictedCompletionDate;
    private String riskLevel;
    private Integer riskScore;
    private Integer delayDays;
    private String reason;
    private Double currentProgress;
    private LocalDateTime createdAt;
}
