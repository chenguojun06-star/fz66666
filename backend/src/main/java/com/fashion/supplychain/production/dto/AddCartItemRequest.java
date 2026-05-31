package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class AddCartItemRequest {
    private String materialCode;
    private String materialName;
    private String materialType;
    private String specifications;
    private String unit;
    private BigDecimal quantity;
    private String supplierId;
    private String supplierName;
    private BigDecimal unitPrice;
    private String sourceType;
    private String sourceId;
    private String sourceNo;
    private BigDecimal sourceQuantity;
    private String color;
    private String fabricComposition;
    private String fabricWidth;
    private String fabricWeight;
    private String remark;
}
