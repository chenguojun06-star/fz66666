package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class EcStatusSyncItem {
    private Long skuId;
    private String skuCode;
    private String platformSkuId;
    private String action;
}
