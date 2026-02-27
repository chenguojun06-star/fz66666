package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class InoutRecommendResponse {
    private String strategy;
    private String reason;
    private List<String> suggestions = new ArrayList<>();
    private List<String> relatedPurchaseIds = new ArrayList<>();
}
