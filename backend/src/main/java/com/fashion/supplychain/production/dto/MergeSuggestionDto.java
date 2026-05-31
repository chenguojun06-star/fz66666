package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class MergeSuggestionDto {
    private String materialCode;
    private String materialName;
    private String specifications;
    private List<MergeableItemDto> items;
    private String suggestion;
    
    @Data
    public static class MergeableItemDto {
        private String id;
        private String supplierName;
        private BigDecimal quantity;
    }
}
