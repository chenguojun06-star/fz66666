package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class PrecheckScanResponse {
    private String riskLevel;
    private List<PrecheckIssue> issues = new ArrayList<>();
    private List<String> suggestions = new ArrayList<>();
    private String traceId;
}
