package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EcPriceSyncItem {
    private Long skuId;
    private String skuCode;
    private String platformSkuId;
    private BigDecimal price;
    private BigDecimal originalPrice;
}
