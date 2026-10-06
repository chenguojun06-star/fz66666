package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * D-754 P4：排产建议采纳请求 — 把 {@code SchedulingSuggestionOrchestrator} 的推荐方案写回订单。
 *
 * <p>采纳动作 = 落地：写回订单的加工厂 + 计划开始/完成日期，并在订单操作日志留下
 * 「谁/何时/采纳了哪个方案」的痕迹（由 {@code ProductionOrderLogAppendHelper} 自动追加操作人与时间）。
 */
@Data
public class SchedulingAdoptionRequest {

    /** 目标订单ID（必填，采纳的写回对象） */
    private String orderId;

    /** 采纳的工厂名（必填） */
    private String factoryName;

    /** 工厂ID（可选，用于与 t_factory 强关联） */
    private String factoryId;

    /** 方案建议的计划开始日期 yyyy-MM-dd（可选，缺省则不改动订单原值） */
    private String plannedStartDate;

    /** 方案建议的计划完成日期 yyyy-MM-dd（可选，缺省则不改动订单原值） */
    private String plannedEndDate;

    /** 方案匹配分（可选，仅用于留痕） */
    private Integer matchScore;

    /** 推荐理由（可选，仅用于留痕） */
    private String reason;
}