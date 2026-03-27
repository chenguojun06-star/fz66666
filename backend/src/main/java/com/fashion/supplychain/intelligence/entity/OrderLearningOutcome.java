package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_learning_outcome")
public class OrderLearningOutcome {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderId;

    private String orderNo;

    private Long decisionSnapshotId;

    private String actualFactoryId;

    private String actualFactoryName;

    private LocalDateTime plannedFinishDate;

    private LocalDateTime actualFinishDate;

    private Integer delayDays;

    private BigDecimal estimatedUnitCost;

    private BigDecimal actualUnitCost;

    private BigDecimal estimatedTotalCost;

    private BigDecimal actualTotalCost;

    private BigDecimal actualScatterExtraCost;

    private BigDecimal costDeviationRate;

    private Integer replenishmentCount;

    private Integer reworkCount;

    private BigDecimal outcomeScore;

    private String outcomeSummary;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
