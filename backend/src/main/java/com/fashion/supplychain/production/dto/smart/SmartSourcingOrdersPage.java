package com.fashion.supplychain.production.dto.smart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 智能采购订单列表分页响应
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartSourcingOrdersPage {

    /** 当前页订单基本信息（未计算，需前端异步调 orders-overview 拿缺料汇总） */
    private List<OrderBasicDto> list;

    /** 符合筛选条件的订单总数 */
    private long total;

    /** 当前实际使用的筛选条件（含后端 clamp 后的值），前端回显用 */
    private SmartSourcingFilter appliedFilter;
}
