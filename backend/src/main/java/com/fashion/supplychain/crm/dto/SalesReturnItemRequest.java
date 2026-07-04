package com.fashion.supplychain.crm.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 退货商品明细请求
 */
@Data
public class SalesReturnItemRequest {

    private String styleId;

    private String styleNo;

    private String styleName;

    private String color;

    private String size;

    private Integer quantity;

    private BigDecimal unitPrice;

    private String returnReason;
}