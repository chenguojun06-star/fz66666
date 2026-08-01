package com.fashion.supplychain.production.service;

import java.util.List;
import java.util.Map;

/**
 * 智能采购推荐服务
 *
 * <p>基于订单BOM物料需求 - 当前库存 - 在途采购 = 净需求
 * 推荐S/A级供应商，生成草稿采购建议推送到购物车
 */
public interface SmartSourcingService {

    /**
     * 为指定订单生成智能采购建议
     *
     * @param tenantId 租户ID
     * @param orderNo  订单号
     * @return 推荐结果摘要（推送了N条到购物车草稿）
     */
    Map<String, Object> generateSourcingForOrder(Long tenantId, String orderNo);

    /**
     * 批量为多个订单生成智能采购建议
     *
     * @param tenantId 租户ID
     * @param orderNos 订单号列表
     * @return 推荐结果摘要
     */
    Map<String, Object> generateSourcingForOrders(Long tenantId, List<String> orderNos);

    /**
     * 查询物料净需求（BOM需求 - 库存 - 在途）
     *
     * @param tenantId 租户ID
     * @param orderNo  订单号
     * @return 物料需求列表
     */
    List<Map<String, Object>> calculateNetDemand(Long tenantId, String orderNo);
}
