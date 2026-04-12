package com.fashion.supplychain.intelligence.dto;

import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PendingTaskSummaryDTO {

    private int totalCount;
    private int highPriorityCount;
    private Map<String, CategoryCount> categoryCounts;
    private String topUrgentTitle;
    private String topUrgentDeepLinkPath;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CategoryCount {
        private String taskType;
        private String label;
        private String icon;
        private int count;
        private int highCount;
    }
}
