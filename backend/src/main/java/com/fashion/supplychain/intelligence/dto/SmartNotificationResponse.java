package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 小程序智能提醒响应 — 推送预览 + 统计
 */
@Data
public class SmartNotificationResponse {
    /** 待推送消息总数 */
    private int pendingCount;
    /** 今日已推送数 */
    private int sentToday;
    /** 推送成功率 % */
    private double successRate;
    /** 消息列表（预览最多20条） */
    private List<NotificationItem> notifications;

    @Data
    public static class NotificationItem {
        /** 消息标题 */
        private String title;
        /** 消息内容 */
        private String content;
        /** 优先级 high / normal / low */
        private String priority;
        /** 目标角色 worker / manager / admin */
        private String targetRole;
        /** 目标用户名 */
        private String targetUserName;
        /** 消息类型 deadline / stagnant / quality / task */
        private String type;
        /** 关联订单号 */
        private String orderNo;
        /** 生成时间 */
        private String createdAt;
    }
}
