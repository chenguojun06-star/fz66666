package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import java.math.BigDecimal;

@Data
@Builder
public class EcStockSyncItem {
    private Long skuId;
    private String skuCode;
    private String platformSkuId;
    private Integer quantity;
    private BigDecimal costPrice;
    private BigDecimal salesPrice;
}
