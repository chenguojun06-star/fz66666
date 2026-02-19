package com.fashion.supplychain.style.dto;

import lombok.Data;

@Data
public class StockUpdateDTO {
    private String skuCode;
    private Integer quantity;
}
