package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

/** Stage6 What-If推演沙盘请求 */
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
}
