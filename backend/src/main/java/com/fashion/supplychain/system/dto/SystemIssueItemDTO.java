package com.fashion.supplychain.system.dto;

import java.time.LocalDateTime;

/**
 * 系统问题单项 DTO
 */
public class SystemIssueItemDTO {

    /** ERROR / WARN / INFO */
    private String level;

    /** SCAN / ORDER / DATABASE / SYSTEM */
    private String category;

    /** 问题标题（一句话） */
    private String title;

    /** 问题详细描述 */
    private String description;

    /** 影响数量（条数/订单数等） */
    private int count;

    /** 最近一次发生时间 */
    private LocalDateTime lastSeen;

    /** 建议操作提示（前端展示用） */
    private String actionHint;

    public SystemIssueItemDTO() {}

    public static SystemIssueItemDTO of(String level, String category,
                                        String title, String description,
                                        int count, LocalDateTime lastSeen,
                                        String actionHint) {
        SystemIssueItemDTO dto = new SystemIssueItemDTO();
        dto.level = level;
        dto.category = category;
        dto.title = title;
        dto.description = description;
        dto.count = count;
        dto.lastSeen = lastSeen;
        dto.actionHint = actionHint;
        return dto;
    }

    public String getLevel() { return level; }
    public String getCategory() { return category; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public int getCount() { return count; }
    public LocalDateTime getLastSeen() { return lastSeen; }
    public String getActionHint() { return actionHint; }
}
