package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

@Data
public class FactoryBottleneckResponse {
    private List<FactoryBottleneckItem> items;

    @Data
    public static class FactoryBottleneckItem {
        private String factoryId;
        private String factoryName;
        private Integer stuckPct;
        private String reason;
    }
}
