package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * MindPush 单条推送规则 (请求/响应两用)
 */
@Data
public class MindPushRuleDTO {

    /** 规则编码：DELIVERY_RISK / STAGNANT / MATERIAL_LOW / PAYROLL_READY */
    private String ruleCode;

    /** 规则名称（中文） */
    private String ruleName;

    /** 是否启用 */
    private Boolean enabled;

    /** 触发天数阈值（如：交期还有 N 天时触发） */
    private Integer thresholdDays;

    /** 触发进度阈值（%，如：进度低于 N% 时触发） */
    private Integer thresholdProgress;

    /** 推送开始时间 HH:mm，如 "08:00" */
    private String notifyTimeStart;

    /** 推送结束时间 HH:mm，如 "22:00" */
    private String notifyTimeEnd;
}
