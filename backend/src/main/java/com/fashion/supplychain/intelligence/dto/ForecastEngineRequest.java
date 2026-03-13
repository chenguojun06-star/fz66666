package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/** Stage5 预测引擎请求：指定预测类型 + 目标对象 */
@Data
public class ForecastEngineRequest {

    /**
     * 预测类型：
     * COST     — 订单/款式生产成本预测
     * DEMAND   — 下月/下季需求量预测
     * MATERIAL — 物料实际用量预测
     */
    private String forecastType;

    /**
     * 目标对象ID（根据 forecastType 含义不同）：
     * COST/MATERIAL → orderId 或 styleNo
     * DEMAND        → 可为空（全租户级别预测）
     */
    private String subjectId;

    /** 预测地平线：本单 / 下月 / 下季（可为空，自动推断） */
    private String horizon;
}
