package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_purchase_suggestion")
public class EcPurchaseSuggestion {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long styleId;
    private Long skuId;
    private String skuCode;
    private String styleNo;
    private Integer suggestQuantity;
    private String urgencyLevel;
    private String reason;
    private Integer sales30d;
    private Integer availableStock;
    private Integer onWayStock;
    private Integer onWayProduction;
    private Integer targetDays;
    private Integer status;
    private Long purchaseOrderId;

    /** 建议类型：PURCHASE=采购 / PRODUCTION=生产（Phase 1 AI 补货顾问） */
    private String suggestionType;

    /** 关联生产订单ID（suggestionType=PRODUCTION 转生产后回填） */
    private Long productionOrderId;

    /** AI 置信度 0-100（< 70 标黄，< 50 标红，强制人工确认） */
    private Integer aiConfidence;

    /** AI 推理过程（透明化决策依据，展示给用户） */
    private String aiReason;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
