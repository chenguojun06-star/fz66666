package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;

@Data
@Builder
public class EcPriceSyncItem {
    private Long skuId;
    private String skuCode;
    private String platformSkuId;
    private BigDecimal price;
    private BigDecimal originalPrice;
}
