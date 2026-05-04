package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import java.util.Map;
import lombok.Data;

@Data
public class NlQueryResponse {
    private String intent;
    private String answer;
    private int confidence;
    private Map<String, Object> data;
    private String componentName;
    private List<String> suggestions;
    private String aiInsight;
    private String errorTraceId;
}
