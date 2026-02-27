package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class InoutRecommendRequest {
    private String orderNo;
    private String operatorId;
    private String operatorName;
    private List<String> purchaseIds = new ArrayList<>();
}
