package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

/**
 * 多代理图执行请求 DTO
 */
@Data
public class MultiAgentRequest {

    /**
     * 需要分析的生产订单 ID 列表。
     * 为空时分析当前租户所有进行中订单（Phase 2 接入 ProductionOrderService 实时拉取）。
     */
    private List<String> orderIds;

    /**
     * 分析场景：
     * - delivery_risk  货期风险分析
     * - sourcing       供应商/采购风险分析
     * - compliance     DPP 合规分析
     * - logistics      物流路线 + 碳排放优化
     * - full（默认）   全面综合分析
     */
    private String scene = "full";

    /**
     * 用户自然语言问题（可选）。
     * 例如："哪些订单需要紧急 reroute？"
     */
    private String question;
}
