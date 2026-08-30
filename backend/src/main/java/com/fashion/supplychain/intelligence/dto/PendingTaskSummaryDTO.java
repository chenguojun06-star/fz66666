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

    /**
     * D-237：小云助手「建议卡片」需要的分类计数。
     * 原先 DTO 只有 categoryCounts 这个 Map，而小程序端读的是
     * overdueOrderCount / qualityTaskCount 等平铺字段，取到的一直是 undefined，
     * 导致建议卡片（逾期/待质检/面料缺口）从来没显示过。这里补上平铺字段。
     */
    private int overdueOrderCount;
    private int qualityTaskCount;

    /**
     * D-237：质检不合格件数（近 30 天）。
     * 用户要求「质检有问题的记录要让小云也知道」——仅靠待质检任务数无法反映
     * 已经发生的不合格/次品情况，故单独统计 defectQuantity > 0 的件数。
     */
    private int qualityDefectCount;

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
