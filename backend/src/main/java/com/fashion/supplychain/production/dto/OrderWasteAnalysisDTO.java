package com.fashion.supplychain.production.dto;

import java.math.BigDecimal;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderWasteAnalysisDTO {

    private String id;
    private String orderNo;
    private String styleNo;
    private String styleId;
    private String styleName;
    private String color;
    private String skuColorImage;
    private String size;
    private String factoryName;
    private String customerName;
    private String salesChannel;

    private Integer orderQuantity;
    private Integer cuttingQuantity;
    private Integer completedQuantity;
    private Integer warehousingQualifiedQuantity;
    private Integer outstockQuantity;
    private Integer unqualifiedQuantity;
    private Integer repairQuantity;

    private Integer cuttingWaste;
    private BigDecimal cuttingWasteRate;
    private Integer productionWaste;
    private BigDecimal productionWasteRate;
    private Integer qualityWaste;
    private BigDecimal qualityWasteRate;
    private Integer shipmentWaste;
    private BigDecimal shipmentWasteRate;
    private Integer totalWaste;
    private BigDecimal totalWasteRate;

    private BigDecimal materialCost;
    private BigDecimal processCost;
    private BigDecimal totalCost;

    private BigDecimal unitCostWithoutWaste;
    private BigDecimal unitCostWithWasteAllocation;
    private BigDecimal unitCostIncrease;
    private BigDecimal unitCostIncreaseRate;

    private String orderStatus;
    private String completionTime;
}