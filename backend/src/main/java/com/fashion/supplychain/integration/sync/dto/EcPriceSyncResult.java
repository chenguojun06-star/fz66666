package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class EcPriceSyncResult {
    private boolean success;
    private int syncedCount;
    private int failedCount;
    private String errorMessage;
}
