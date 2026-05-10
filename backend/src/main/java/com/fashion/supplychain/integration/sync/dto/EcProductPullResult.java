package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;
import java.util.Map;

@Data
@Builder
public class EcProductPullResult {
    private boolean success;
    private Map<String, Object> productData;
    private String errorMessage;
}
