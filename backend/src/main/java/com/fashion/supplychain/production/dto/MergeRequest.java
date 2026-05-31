package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class MergeRequest {
    private List<String> itemIds;
    private BigDecimal targetQuantity;
    private String targetSupplierId;
    private String targetSupplierName;
}
