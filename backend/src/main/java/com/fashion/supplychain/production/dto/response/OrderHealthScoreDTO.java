package com.fashion.supplychain.production.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 订单健康度评分响应 DTO
 * 
 * @author AI Agent
 * @since 2026-03-22
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderHealthScoreDTO {

    /**
     * 订单 ID
     */
    private String orderId;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 综合健康度评分（0-100）
     */
    private Integer score;

    /**
     * 风险等级
     * - NORMAL: 绿色，正常（≥75 分）
     * - WARNING: 橙色，需注意（50-74 分）
     * - CRITICAL: 红色，危险（<50 分）
     */
    private String level;

    /**
     * 徽章显示名称
     * - null: 不显示徽章（≥75 分）
     * - "注": 橙色徽章（50-74 分）
     * - "危": 红色徽章（<50 分）
     */
    private String badge;

    /**
     * 风险提示文案
     */
    private String hint;

    /**
     * 进度权重得分（0-40 分）
     */
    private Integer progressScore;

    /**
     * 货期权重得分（0-35 分）
     */
    private Integer deadlineScore;

    /**
     * 采购权重得分（0-25 分）
     */
    private Integer procurementScore;

    /**
     * 构造函数（快速初始化）
     */
    public OrderHealthScoreDTO(Integer score, String level) {
        this.score = score;
        this.level = level;
        this.badge = getBadgeFromLevel(level);
    }

    /**
     * 从风险等级获取徽章文本
     */
    private static String getBadgeFromLevel(String level) {
        if ("NORMAL".equals(level)) {
            return null;        // 不显示
        } else if ("WARNING".equals(level)) {
            return "注";        // 橙色
        } else if ("CRITICAL".equals(level)) {
            return "危";        // 红色
        }
        return null;
    }
}
