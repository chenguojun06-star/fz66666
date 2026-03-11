package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

import java.util.List;

/**
 * B6 - 审批建议响应 DTO
 */
@Data
public class ApprovalAdvisorResponse {

    /** 待审批总数 */
    private int pendingCount;

    /** 高风险数量 */
    private int highRiskCount;

    /** 建议列表（按风险优先级降序） */
    private List<ApprovalAdvice> items;

    @Data
    public static class ApprovalAdvice {
        /** 审批单 ID */
        private String approvalId;

        /** 操作类型：SCAN_UNDO / ORDER_DELETE / ORDER_MODIFY / STYLE_DELETE / SAMPLE_DELETE */
        private String operationType;

        /** 目标单号（订单号/款号等） */
        private String targetNo;

        /** 申请人姓名 */
        private String applicantName;

        /** 所属部门/工厂 */
        private String orgUnitName;

        /** 申请理由 */
        private String applyReason;

        /** 申请时间（ISO字符串） */
        private String applyTime;

        /** 挂起小时数 */
        private int pendingHours;

        /** AI 建议：APPROVE / REJECT / ESCALATE */
        private String verdict;

        /** 建议原因说明 */
        private String verdictReason;

        /** 风险等级：low / medium / high */
        private String riskLevel;

        /** 综合评分（越高越优先处理） */
        private double priorityScore;
    }
}
