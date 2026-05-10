package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import java.util.Map;

@Data
@Builder
public class EcStockPullResult {
    private boolean success;
    private Map<String, Integer> stockMap;
    private String errorMessage;
}
