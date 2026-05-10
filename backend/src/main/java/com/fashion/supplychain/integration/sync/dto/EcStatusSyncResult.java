package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class EcStatusSyncResult {
    private boolean success;
    private int syncedCount;
    private String errorMessage;
}
