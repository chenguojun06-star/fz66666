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

    /** 样衣开发：样板数量 */
    private Integer quantity;
    /** 样衣开发：当前阶段开始时间（ISO格式字符串） */
    private String startTime;
    /** 样衣开发：交板日期（截止时间，ISO格式字符串） */
    private String endTime;
    /** 当前阶段领取人名字 */
    private String assigneeName;
    /** 责任人用户ID（用于按责任人过滤） */
    private String assigneeId;
    /** 任务状态：pending=待处理 / completed=已完成 */
    private String taskStatus;
    /** 责任人角色标签（如"跟单员"、"财务人员"、"工厂"），前端展示用 */
    private String assigneeRole;

    public int getPriorityOrder() {
        if ("high".equals(priority)) return 0;
        if ("medium".equals(priority)) return 1;
        return 2;
    }
}
