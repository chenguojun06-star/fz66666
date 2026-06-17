package com.fashion.supplychain.production.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderWasteSummaryDTO {

    private Integer totalOrderQuantity;
    private Integer totalCuttingQuantity;
    private Integer totalCompletedQuantity;
    private Integer totalWarehousingQuantity;
    private Integer totalOutstockQuantity;

    private Integer totalCuttingWaste;
    private BigDecimal avgCuttingWasteRate;
    private Integer totalProductionWaste;
    private BigDecimal avgProductionWasteRate;
    private Integer totalQualityWaste;
    private BigDecimal avgQualityWasteRate;
    private Integer totalShipmentWaste;
    private BigDecimal avgShipmentWasteRate;
    private Integer totalWaste;
    private BigDecimal avgTotalWasteRate;

    private BigDecimal totalMaterialCost;
    private BigDecimal totalProcessCost;
    private BigDecimal totalCost;

    private BigDecimal avgUnitCostWithoutWaste;
    private BigDecimal avgUnitCostWithWaste;
    private BigDecimal totalCostIncrease;
    private BigDecimal avgCostIncreaseRate;

    private List<WasteByFactoryDTO> wasteByFactory;
    private List<WasteByStyleDTO> wasteByStyle;
    private List<WasteTrendDTO> wasteTrend;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WasteByFactoryDTO {
        private String factoryId;
        private String factoryName;
        private Integer orderQuantity;
        private Integer wasteQuantity;
        private BigDecimal wasteRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WasteByStyleDTO {
        private String styleId;
        private String styleNo;
        private String styleName;
        private Integer orderQuantity;
        private Integer wasteQuantity;
        private BigDecimal wasteRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WasteTrendDTO {
        private String date;
        private Integer orderQuantity;
        private Integer wasteQuantity;
        private BigDecimal wasteRate;
    }
}