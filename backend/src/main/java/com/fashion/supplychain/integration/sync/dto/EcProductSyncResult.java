package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class EcProductSyncResult {
    private boolean success;
    private String platformItemId;
    private List<String> platformSkuIds;
    private String errorCode;
    private String errorMessage;
}
