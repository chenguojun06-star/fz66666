package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

/**
 * Stage6 What-If推演沙盘请求
 *
 * <p>P2升级：新增 naturalScenario 字段，支持自然语言描述假设情景</p>
 */
@Data
public class WhatIfRequest {

    /** 目标订单ID（多个用逗号分隔，或留空=当前所有在产订单） */
    private String orderIds;

    /**
     * 推演场景列表，每个场景包含：
     * {
     *   "type": "ADVANCE_DELIVERY|CHANGE_FACTORY|ADD_WORKERS|COST_REDUCE|DELAY_START",
     *   "value": 3           (天数/人数/比例)
     *   "factoryId": "..."   (仅 CHANGE_FACTORY 需要)
     * }
     */
    private List<Map<String, Object>> scenarios;

    // ══════════════════════════════════════════════════════════════════════════
    // 【P2升级】自然语言场景解析
    // 用户可以用自然语言描述假设情景，系统自动解析为标准场景
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 自然语言场景描述（新增字段）
     *
     * <p>示例：</p>
     * <ul>
     *   <li>"如果这家工厂明天停电2天"</li>
     *   <li>"如果增加5个工人加班3天"</li>
     *   <li>"如果把订单转到B工厂"</li>
     *   <li>"如果原材料晚到5天"</li>
     * </ul>
     *
     * <p>支持多场景，用"|"分隔：</p>
     * <ul>
     *   <li>"停电2天 | 增加工人 | 转B工厂"</li>
     * </ul>
     */
    private String naturalScenario;

    /**
     * 是否启用自然语言场景解析
     * 优先级：naturalScenario > scenarios
     */
    private Boolean enableNaturalParsing;
}
