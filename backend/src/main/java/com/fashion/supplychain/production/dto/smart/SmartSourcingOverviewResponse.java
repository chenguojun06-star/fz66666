package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 批量订单概览响应（orders-overview 接口返回）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartSourcingOverviewResponse {

    /** 每个订单号 → 概览计算结果（成功的都有） */
    private Map<String /*orderNo*/, OrderOverviewDto> overviews;

    /** 哪些订单命中了缓存（前端展示"⏱缓存"标签） */
    private List<String> fromCache;

    /** 哪些订单是本次新计算的 */
    private List<String> computed;

    /** 计算失败的订单 + 原因，成功的不在这里 */
    private Map<String /*orderNo*/, String /*errorMsg*/> failed;

    /** 用于统计的缺料订单数（直接给前端汇总栏显示） */
    private int shortageOrderCount;

    /** 所有缺料单的预计金额合计（直接给前端汇总栏显示） */
    private java.math.BigDecimal totalShortageAmount;
}
