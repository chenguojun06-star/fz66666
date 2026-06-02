package com.fashion.supplychain.intelligence.engine.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class RiskSet {
    private List<RiskItem> items = new ArrayList<>();
    private int totalCount;
    private Long tenantId;

    @Data
    public static class RiskItem {
        private String orderId;
        private String riskType;
        private String severity;
        private String description;
        private Long assigneeUserId;
    }
}
