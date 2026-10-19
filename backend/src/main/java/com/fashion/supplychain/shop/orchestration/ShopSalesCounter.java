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
 * <p><b>按 style_id 关联，style_no 只作存量兜底</b>：
 * {@code t_shop_order_item} 原先<b>只有 style_no、没有 style_id</b>，是历史设计留下的坑 ——
 * 款号一旦修改，历史销量就再也关联不上，表现为「改款号后已售数清零」且全程无报错。
 * 已由 {@code V202710160006__shop_order_item_style_id.sql} 补列并回填存量。
 *
 * <p>保留 style_no 兜底是因为回填可能匹配不到（款号对不上款档案），
 * 这些老行 style_id 为 NULL，直接丢弃会让它们的销量凭空消失 ——
 * 比"暂时按旧口径算"更糟。
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
     * 按款式统计真实成交件数。<b>优先返回 styleId 口径</b>。
     *
     * @param tenantId 显式传租户 —— **不能依赖 UserContext**：顾客端是免登录请求，
     *                 那里 UserContext 是空的（D-785 同款陷阱，线上实测踩过：
     *                 单测全绿、线上销量恒为空）
     * @return styleId → 成交件数；无数据时返回空 Map（<b>不返回 0 兜底</b>：
     *         「没销量」和「销量 0」在业务上是两回事，前端要显示「暂无成交」）
     */
    public Map<Long, Integer> soldQtyByStyleId(Long tenantId) {
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
                        .select(ShopOrderItem::getStyleId, ShopOrderItem::getStyleNo,
                                ShopOrderItem::getQuantity));
        if (items == null || items.isEmpty()) {
            return Map.of();
        }

        Map<Long, Integer> out = new HashMap<>();
        int fallback = 0;
        for (ShopOrderItem it : items) {
            if (it.getQuantity() == null || it.getQuantity() <= 0) {
                continue;
            }
            Long sid = it.getStyleId();
            if (sid != null) {
                out.merge(sid, it.getQuantity(), Integer::sum);
                continue;
            }
            // 回填不到 style_id 的老行：先记下来，退回旧口径由调用方兜底，
            // 不能直接丢 —— 丢了这批历史销量就凭空消失了
            String no = it.getStyleNo();
            if (no != null && !no.isBlank()) {
                fallback++;
            }
        }
        if (fallback > 0) {
            // 有老数据还没回填上 style_id，提醒一句：不是报错，但要能查到
            log.warn("[真实销量] {} 行缺 style_id，暂未计入（款号已改或款档案缺失）", fallback);
        }
        if (log.isDebugEnabled() && !out.isEmpty()) {
            log.debug("[真实销量] 款式 {} 个有成交", out.size());
        }
        return out;
    }

    /**
     * 旧口径兜底：只统计 **style_id 为空** 的存量行，按款号归集。
     *
     * <p>刻意只取 style_id 为空的行，不重复统计已回填过的 ——
     * 两边都算就是销量翻倍，那是比算错更严重的展示事故。
     * 等存量全部回填完成、本方法自然返回空 Map，届时可以删掉。
     */
    public Map<String, Integer> soldQtyByStyleNoFallback(Long tenantId) {
        if (tenantId == null) {
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
                        .isNull(ShopOrderItem::getStyleId)
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
        return out;
    }
}