package com.fashion.supplychain.system.dto;

import java.util.Map;
import lombok.Data;

@Data
public class TenantSmartFeatureSaveRequest {
    private Map<String, Boolean> features;
}
