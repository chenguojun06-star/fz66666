package com.fashion.supplychain.production.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class SplitRequest {
    private String itemId;
    private BigDecimal splitQuantity;
}
