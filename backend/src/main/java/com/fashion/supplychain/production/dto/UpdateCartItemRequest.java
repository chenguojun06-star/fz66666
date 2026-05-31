package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class UpdateCartItemRequest {
    private BigDecimal quantity;
    private String supplierId;
    private String supplierName;
    private BigDecimal unitPrice;
    private String remark;
}
