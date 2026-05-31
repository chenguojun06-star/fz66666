package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class CartPreviewDto {
    private List<PurchaseGroupDto> purchaseGroups;
    private PreviewSummary summary;
    
    @Data
    public static class PurchaseGroupDto {
        private String groupKey;
        private String materialCode;
        private String materialName;
        private String specifications;
        private String supplierId;
        private String supplierName;
        private BigDecimal totalQuantity;
        private BigDecimal unitPrice;
        private BigDecimal totalAmount;
        private List<SourceItemDto> sourceItems;
    }
    
    @Data
    public static class SourceItemDto {
        private String sourceType;
        private String sourceNo;
        private BigDecimal quantity;
    }
    
    @Data
    public static class PreviewSummary {
        private Integer totalGroups;
        private Integer totalItems;
        private BigDecimal totalAmount;
    }
}
