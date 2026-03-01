package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 智能异常自愈响应 — 健康状态卡片 + 自愈时间轴
 */
@Data
public class SelfHealingResponse {
    /** 系统总健康度 0-100 */
    private int healthScore;
    /** 健康状态 healthy / warning / critical */
    private String status;
    /** 已检查项数 */
    private int totalChecks;
    /** 发现问题数 */
    private int issuesFound;
    /** 已自动修复数 */
    private int autoFixed;
    /** 需人工介入数 */
    private int needManual;
    /** 诊断详情 */
    private List<DiagnosisItem> items;

    @Data
    public static class DiagnosisItem {
        /** 检查项名称 */
        private String checkName;
        /** 检查类型 progress / stock / settlement / scan */
        private String checkType;
        /** 状态 ok / fixed / warning / error */
        private String result;
        /** 描述 */
        private String description;
        /** 影响订单数 */
        private int affectedOrders;
        /** 最后修复时间 */
        private String fixedAt;
    }
}
