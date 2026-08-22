package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.dto.smart.*;

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

    // ==================== 升级后新增（方案A：订单列表 + 批量按需计算 + 2h缓存）====================

    /**
     * 订单列表（仅查 t_production_order，不做净需求计算）
     *
     * <p>性能：1次 SQL，<300ms
     *
     * @param tenantId 租户ID
     * @param filter   筛选条件（所有字段可选）
     * @return 当前页订单 + 总数 + 实际生效的筛选值
     */
    SmartSourcingOrdersPage listOrders(Long tenantId, SmartSourcingFilter filter);

    /**
     * 批量订单概览（净需求汇总计算，结果缓存2h）
     *
     * <p>性能：原本 20订单 × 50SQL/单 = 1000SQL → 优化后 ≤ 8 次批量 SQL
     * <p>硬限制：orderNos 数量 ≤ 20，超出抛 BusinessException
     *
     * @param tenantId 租户ID
     * @param orderNos 订单号列表（≤20个）
     * @param forceRefresh 是否强制忽略缓存并重新计算（用户点"刷新"时传 true）
     * @return 每个订单的缺料汇总（Map）+ 缓存命中 + 计算失败列表 + 统计值
     */
    SmartSourcingOverviewResponse buildOverviewsBatch(Long tenantId, List<String> orderNos, boolean forceRefresh);

    /**
     * 单订单物料明细（优先读缓存，miss才计算）
     *
     * <p>用户在列表行点「详情」时调用，数据内容与 calculateNetDemand 完全一致
     *
     * @param tenantId 租户ID
     * @param orderNo  订单号
     * @param forceRefresh 是否强制刷新（用户详情里点↻时传true）
     * @return 物料明细列表（同 calculateNetDemand 结构）
     */
    List<Map<String, Object>> getOrderDetailCached(Long tenantId, String orderNo, boolean forceRefresh);
}
