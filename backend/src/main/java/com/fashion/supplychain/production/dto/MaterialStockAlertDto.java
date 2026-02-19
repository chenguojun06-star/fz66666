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
    private Integer quantity;
    private Integer safetyStock;
    private Integer recentOutQuantity;
    private Integer suggestedSafetyStock;
    private Integer dailyOutQuantity;
    private Boolean needReplenish;
    private LocalDateTime lastOutTime;
    private BigDecimal perPieceUsage;
    private Integer minProductionQty;
    private Integer maxProductionQty;
}
