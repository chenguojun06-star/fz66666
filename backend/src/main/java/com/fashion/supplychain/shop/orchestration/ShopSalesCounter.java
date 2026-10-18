package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * D-811：款式真实销量（顾客端「已售 N 件」的唯一数据来源）。
 *
 * <p><b>口径</b>：只统计**已发货**的订单数量之和。已取消（CANCELLED）不计 ——
 * 取消的订单算销量等于把退货也报喜，是数据造假。待发货是否计入？
 * 本实现**计入待发货**（已付款未取消就是真实成交，取消会回退），
 * 与电商平台的「已付款件数」口径一致。
 *
 * <p><b>为什么按款号关联而不是 style_id</b>：
 * {@code t_shop_order_item} <b>只有 style_no、没有 style_id</b>（线上表结构实测）。
 * 这是历史设计留下的坑：款号一旦修改，历史销量就再也关联不上，
 * 表现为「改款号后已售数清零」且无任何报错。
 * 这里按现有结构实现并记录该缺陷 —— {@code styleId} 需要补列才能根治，
 * 属于 D-811 的后续项，不在本次悄悄改表结构（改表会让线上 2 单的历史销量
 * 在迁移窗口里对不上）。
 */
@Component
public class ShopSalesCounter {

    private static final Logger log = LoggerFactory.getLogger(ShopSalesCounter.class);

    /** 不计入销量的订单状态：已取消。 */
    private static final Set<String> EXCLUDED_STATUS = Set.of("CANCELLED");

    @Autowired
    private ShopOrderMapper orderMapper;

    @Autowired
    private ShopOrderItemMapper itemMapper;

    /**
     * 按款号统计真实成交件数。
     *
     * @param tenantId 显式传租户 —— **不能依赖 UserContext**：顾客端是免登录请求，
     *                 那里 UserContext 是空的（D-785 同款陷阱，线上实测踩过：
     *                 单测全绿、线上销量恒为空）
     * @return 款号 → 成交件数；无数据时返回空 Map（<b>不返回 0 兜底</b>：
     *         「没销量」和「销量 0」在业务上是两回事，前端要显示「暂无成交」）
     */
    public Map<String, Integer> soldQtyByStyleNo(Long tenantId) {
        if (tenantId == null) {
            // 公开请求没有登录态，UserContext.tenantId() 是空的（D-785 同款陷阱）。
            // 租户不明时直接返回空：宁可「暂无成交」，也不能把销量算到别的租户头上。
            log.warn("[真实销量] 缺少 tenantId，跳过统计");
            return Map.of();
        }
        List<ShopOrder> orders = orderMapper.selectList(
                Wrappers.<ShopOrder>lambdaQuery()
                        .eq(ShopOrder::getTenantId, tenantId)
                        .in(ShopOrder::getStatus, List.of("PENDING_SHIP", "SHIPPED"))
                        .select(ShopOrder::getId));
        if (orders == null || orders.isEmpty()) {
            return Map.of();
        }
        Set<String> orderIds = orders.stream()
                .map(ShopOrder::getId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (orderIds.isEmpty()) {
            return Map.of();
        }

        List<ShopOrderItem> items = itemMapper.selectList(
                Wrappers.<ShopOrderItem>lambdaQuery()
                        .in(ShopOrderItem::getOrderId, orderIds)
                        .eq(ShopOrderItem::getTenantId, tenantId)
                        .select(ShopOrderItem::getStyleNo, ShopOrderItem::getQuantity));
        if (items == null || items.isEmpty()) {
            return Map.of();
        }

        Map<String, Integer> out = new HashMap<>();
        for (ShopOrderItem it : items) {
            String no = it.getStyleNo();
            if (no == null || no.isBlank() || it.getQuantity() == null || it.getQuantity() <= 0) {
                continue;
            }
            out.merge(no.trim(), it.getQuantity(), Integer::sum);
        }
        if (log.isDebugEnabled() && !out.isEmpty()) {
            log.debug("[真实销量] 款号 {} 个有成交", out.size());
        }
        return out;
    }
}