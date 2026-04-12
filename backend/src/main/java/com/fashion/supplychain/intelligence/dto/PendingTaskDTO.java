package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PendingTaskDTO {

    private String id;
    private String taskType;
    private String module;
    private String title;
    private String description;
    private String orderNo;
    private String styleNo;
    private String deepLinkPath;
    private String priority;
    private LocalDateTime createdAt;
    private String categoryLabel;
    private String categoryIcon;

    public int getPriorityOrder() {
        if ("high".equals(priority)) return 0;
        if ("medium".equals(priority)) return 1;
        return 2;
    }
}
