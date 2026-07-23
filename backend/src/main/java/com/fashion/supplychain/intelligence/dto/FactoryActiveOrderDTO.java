package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 工厂在产订单明细 DTO（下单页详情抽屉用）
 */
@Data
public class FactoryActiveOrderDTO {
    /** 订单ID */
    private String orderId;
    /** 订单号 */
    private String orderNo;
    /** 款号 */
    private String styleNo;
    /** 款名 */
    private String styleName;
    /** 客户名 */
    private String customerName;
    /** 订单数量 */
    private Integer orderQuantity;
    /** 已完成数量 */
    private Integer completedQuantity;
    /** 剩余数量 */
    private Integer remainingQuantity;
    /** 生产进度 0-100 */
    private Integer productionProgress;
    /** 计划交期 yyyy-MM-dd */
    private String plannedEndDate;
    /** 距交期天数（负数表示已逾期） */
    private int daysToDeadline;
    /** 状态：production/cutting 等 */
    private String status;
    /** 紧急程度 */
    private String urgencyLevel;
    /** 跟单员 */
    private String merchandiser;
    /** 风险等级：safe / warning / danger */
    private String riskLevel;
}
