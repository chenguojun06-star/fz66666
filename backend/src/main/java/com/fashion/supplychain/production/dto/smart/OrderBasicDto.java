package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 订单列表基本信息（轻量，仅查 t_production_order，0计算）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderBasicDto {

    private String orderNo;
    private String styleNo;
    private String styleName;
    private String coverImage;
    private Integer orderQuantity;

    /** 物料到位率（已有字段，直接展示） */
    private Integer materialArrivalRate;

    /** 订单状态：pending / in_production / paused / completed 等 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 计划完成日期（当成交期显示） */
    private LocalDateTime plannedEndDate;

    /** 紧急程度：urgent / normal */
    private String urgencyLevel;

    /** 跟单人 */
    private String merchandiser;
}
