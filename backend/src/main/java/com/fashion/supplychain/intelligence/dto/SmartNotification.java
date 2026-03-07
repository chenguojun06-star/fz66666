package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 智能通知 — AI 分析输出的建议
 *
 * 由 SmartNotification 编排器生成，提供给 CommandGenerator 转换成可执行命令
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartNotification {
    /** 通知 ID */
    private String notificationId;

    /** 租户 ID */
    private Long tenantId;

    /** 关联订单 ID */
    private String orderId;

    /** 通知标题 */
    private String title;

    /** 通知内容 */
    private String content;

    /** AI 推荐的行动 */
    private String recommendedAction;

    /** 优先级: high / normal / low */
    private String priority;

    /** 通知类型: delay / stagnant / quality / cost / risk 等 */
    private String notificationType;

    /** 关联的数据 (JSON) */
    private String associatedData;

    /** 创建时间戳 */
    private Long createdAt;
}
