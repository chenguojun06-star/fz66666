package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_order_decision_snapshot")
public class OrderDecisionSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private String styleCategory;

    private String factoryMode;

    private String factoryId;

    private String factoryName;

    private String selectedPricingMode;

    private BigDecimal selectedOrderUnitPrice;

    private String selectedScatterPricingMode;

    private BigDecimal selectedScatterUnitPrice;

    private BigDecimal processUnitPrice;

    private BigDecimal sizeUnitPrice;

    private BigDecimal totalCostUnitPrice;

    private BigDecimal quotationUnitPrice;

    private String aiRecommendedPricingMode;

    private String aiRecommendedFactoryMode;

    private BigDecimal aiRecommendedUnitPrice;

    private Integer orderQuantity;

    private Integer colorCount;

    private Integer sizeCount;

    private BigDecimal scatterExtraPerPiece;

    private String recommendationReason;

    private String pricingContextJson;

    private String decisionType;

    private String decisionData;

    private String aiSuggestion;

    private BigDecimal aiConfidence;

    private String userChoice;

    private String userModifiedFields;

    private String createdBy;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
