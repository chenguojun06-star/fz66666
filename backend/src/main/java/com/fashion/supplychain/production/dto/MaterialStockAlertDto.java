package com.fashion.supplychain.production.dto;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class MaterialStockAlertDto {
    private String stockId;
    private String materialId;
    private String materialCode;
    private String materialName;
    private String materialType;
    private String unit;
    private String color;
    private String size;
    /** 当前库存（D-466：改为小数，面料 375.5 米不应显示成 375） */
    private BigDecimal quantity;
    private Integer safetyStock;
    private Integer recentOutQuantity;
    private Integer suggestedSafetyStock;
    private Integer dailyOutQuantity;
    private Boolean needReplenish;
    private LocalDateTime lastOutTime;
    private BigDecimal perPieceUsage;
    private Integer minProductionQty;
    private Integer maxProductionQty;
    private String supplierName;
    private String fabricWidth;
    private String fabricWeight;
    private String fabricComposition;
}
