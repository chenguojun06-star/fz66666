package com.fashion.supplychain.ticket.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.mapper.ReceivableMapper;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSaleItem;
import com.fashion.supplychain.pos.entity.SalesTicket;
import com.fashion.supplychain.pos.mapper.PosSaleItemMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.ticket.TicketTypes;
import com.fashion.supplychain.ticket.dto.TicketData;
import com.fashion.supplychain.ticket.dto.TicketItemData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 电子小票聚合器：按来源单据类型实时汇聚小票数据（不落库、不复制业务数据）。
 *
 * <p><b>多租户关键</b>：公开接口无登录态，聚合查询一律以源单据/小票行上的
 * tenantId 显式过滤（P0 铁律 4）。输出只含对客户可见字段，绝不含成本/利润。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TicketAssembler {

    private final PosSaleMapper posSaleMapper;
    private final PosSaleItemMapper posSaleItemMapper;
    private final ShopOrderMapper shopOrderMapper;
    private final ShopOrderItemMapper shopOrderItemMapper;
    private final ProductOutstockMapper productOutstockMapper;
    private final ProductSkuMapper productSkuMapper;
    private final StyleInfoMapper styleInfoMapper;
    private final ReceivableMapper receivableMapper;

    /**
     * 来源单据存在性校验（建票前调用，P1-2）：登录态惰性补建入口
     * 必须先确认来源单据真实存在且归属该租户，否则任意登录用户可对
     * 任意 sourceBizId 建出空壳小票（冒烟实测踩中）。未知类型返回 false。
     * <p>P1-2 回归修复（2026-10-20 线上反馈）：SHOP_ORDER / OUTSTOCK 主键是
     * ASSIGN_UUID 字符串，不能用 parseLongOrNull（会误杀全部 UUID 单据报 400）；
     * 仅 POS_SALE 是 Long 自增主键，需要数字解析。
     */
    public boolean sourceExists(Long tenantId, String sourceBizType, String sourceBizId) {
        boolean idValid = switch (sourceBizType) {
            case TicketTypes.POS_SALE -> parseLongOrNull(sourceBizId) != null;
            case TicketTypes.SHOP_ORDER, TicketTypes.OUTSTOCK -> StringUtils.hasText(sourceBizId);
            default -> false;
        };
        if (!idValid) {
            return false;
        }
        return switch (sourceBizType) {
            case TicketTypes.POS_SALE -> posSaleMapper.selectCount(new LambdaQueryWrapper<PosSale>()
                    .eq(PosSale::getId, Long.valueOf(sourceBizId.trim())).eq(PosSale::getTenantId, tenantId)) > 0;
            case TicketTypes.SHOP_ORDER -> shopOrderMapper.selectCount(new LambdaQueryWrapper<ShopOrder>()
                    .eq(ShopOrder::getId, sourceBizId).eq(ShopOrder::getTenantId, tenantId)) > 0;
            case TicketTypes.OUTSTOCK -> productOutstockMapper.selectCount(new LambdaQueryWrapper<ProductOutstock>()
                    .eq(ProductOutstock::getId, sourceBizId).eq(ProductOutstock::getTenantId, tenantId)) > 0;
            default -> false;
        };
    }

    public TicketData assemble(SalesTicket ticket) {
        TicketData data = new TicketData();
        data.setTicketNo(ticket.getTicketNo());
        data.setSignToken(ticket.getSignToken());
        data.setStatus(ticket.getStatus());
        data.setSignedTime(ticket.getSignedTime());
        data.setSignedBy(ticket.getSignedBy());
        data.setSourceBizType(ticket.getSourceBizType());
        data.setSourceBizNo(ticket.getSourceBizNo());
        data.setCreateTime(ticket.getCreateTime());

        switch (ticket.getSourceBizType()) {
            case TicketTypes.POS_SALE -> fillFromPosSale(ticket, data);
            case TicketTypes.SHOP_ORDER -> fillFromShopOrder(ticket, data);
            case TicketTypes.OUTSTOCK -> fillFromOutstock(ticket, data);
            default -> log.warn("[小票] 未知来源类型 type={} ticketNo={}", ticket.getSourceBizType(), ticket.getTicketNo());
        }
        data.setMatrix(buildMatrix(data.getItems()));
        return data;
    }

    // ── POS 收银台 ─────────────────────────────────────────────────────────

    private void fillFromPosSale(SalesTicket ticket, TicketData data) {
        // P1-1（2026-10-17）：显式带 ticket.tenantId，不依赖「公开请求 UserContext 为空
        // → 租户拦截器放行」这个隐性契约。否则将来任何人给 /api/public/** 加默认租户上下文，
        // 小票会全部查不到且被挂接点的 try-catch 吞掉 → 静默失败。
        PosSale sale = posSaleMapper.selectOne(new LambdaQueryWrapper<PosSale>()
                .eq(PosSale::getId, Long.valueOf(ticket.getSourceBizId()))
                .eq(PosSale::getTenantId, ticket.getTenantId())
                .last("LIMIT 1"));
        if (sale == null) {
            return;
        }
        data.setCustomerName(sale.getCustomerName());
        data.setCustomerPhone(maskPhone(sale.getCustomerPhone()));
        data.setServerName(sale.getCashier());
        data.setItemCount(sale.getItemCount());
        data.setGoodsAmount(sale.getGoodsAmount());
        data.setDiscountAmount(sale.getDiscountAmount());
        data.setTotalAmount(sale.getTotalAmount());
        data.setPayMethod(sale.getPayMethod());
        data.setPayStatus(sale.getPayStatus());
        data.setPaidTime(sale.getPaidTime());
        data.setRemark(sale.getRemark());

        List<PosSaleItem> rows = posSaleItemMapper.selectList(new LambdaQueryWrapper<PosSaleItem>()
                .eq(PosSaleItem::getSaleId, sale.getId())
                .eq(PosSaleItem::getTenantId, sale.getTenantId()));
        List<TicketItemData> items = new ArrayList<>();
        for (PosSaleItem r : rows) {
            TicketItemData it = new TicketItemData();
            it.setSkuId(r.getSkuId());
            it.setSkuCode(r.getSkuCode());
            it.setStyleNo(r.getStyleNo());
            it.setStyleName(r.getStyleName());
            it.setColor(r.getColor());
            it.setSize(r.getSize());
            it.setUnitPrice(r.getUnitPrice());
            it.setQuantity(r.getQuantity());
            it.setAmount(r.getAmount());
            items.add(it);
        }
        fillImages(items, sale.getTenantId());
        data.setItems(items);
        fillReceivable(sale.getReceivableId(), data, ticket.getTenantId());
    }

    // ── C端店铺订单 ─────────────────────────────────────────────────────────

    private void fillFromShopOrder(SalesTicket ticket, TicketData data) {
        ShopOrder order = shopOrderMapper.selectOne(new LambdaQueryWrapper<ShopOrder>()
                .eq(ShopOrder::getId, ticket.getSourceBizId())
                .eq(ShopOrder::getTenantId, ticket.getTenantId())
                .last("LIMIT 1"));
        if (order == null) {
            return;
        }
        data.setCustomerName(order.getCustomerName());
        data.setCustomerPhone(order.getPhone());
        data.setItemCount(order.getItemCount());
        data.setGoodsAmount(order.getGoodsAmount());
        data.setShippingFee(order.getShippingFee());
        data.setTotalAmount(order.getTotalAmount());
        data.setOrderStatus(order.getStatus());
        data.setRemark(order.getRemark());

        List<ShopOrderItem> rows = shopOrderItemMapper.selectList(new LambdaQueryWrapper<ShopOrderItem>()
                .eq(ShopOrderItem::getOrderId, order.getId())
                .eq(ShopOrderItem::getTenantId, order.getTenantId()));
        List<TicketItemData> items = new ArrayList<>();
        for (ShopOrderItem r : rows) {
            TicketItemData it = new TicketItemData();
            it.setSkuId(r.getSkuId());
            it.setSkuCode(r.getSkuCode());
            it.setStyleNo(r.getStyleNo());
            it.setStyleName(r.getStyleName());
            it.setColor(r.getColor());
            it.setSize(r.getSize());
            it.setUnitPrice(r.getUnitPrice());
            it.setQuantity(r.getQuantity());
            it.setAmount(r.getAmount());
            items.add(it);
        }
        fillImages(items, order.getTenantId());
        data.setItems(items);
        fillReceivable(order.getReceivableId(), data, ticket.getTenantId());
    }

    // ── 批发销售出库 ────────────────────────────────────────────────────────

    private void fillFromOutstock(SalesTicket ticket, TicketData data) {
        ProductOutstock out = productOutstockMapper.selectOne(new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getId, ticket.getSourceBizId())
                .eq(ProductOutstock::getTenantId, ticket.getTenantId())
                .last("LIMIT 1"));
        if (out == null) {
            return;
        }
        data.setCustomerName(out.getCustomerName());
        data.setCustomerPhone(maskPhone(out.getCustomerPhone()));
        data.setServerName(out.getCreatorName());
        data.setGoodsAmount(out.getTotalAmount());
        data.setTotalAmount(out.getTotalAmount());
        data.setItemCount(out.getOutstockQuantity());
        data.setPayStatus(out.getPaymentStatus());
        data.setRemark(out.getRemark());

        TicketItemData it = new TicketItemData();
        it.setSkuCode(out.getSkuCode());
        it.setStyleId(out.getStyleId());
        it.setStyleNo(out.getStyleNo());
        it.setStyleName(out.getStyleName());
        it.setColor(out.getColor());
        it.setSize(out.getSize());
        it.setUnitPrice(out.getSalesPrice());
        it.setQuantity(out.getOutstockQuantity());
        it.setAmount(out.getTotalAmount());
        List<TicketItemData> items = new ArrayList<>();
        items.add(it);
        fillImages(items, out.getTenantId());
        data.setItems(items);
    }

    // ── 通用填充 ────────────────────────────────────────────────────────────

    /**
     * 应收状态（POS 挂账 / 店铺订单）：无应收为 null，不抛错。
     *
     * <p>tenantId 由调用方显式传入（即 ticket.tenantId）—— P1-1：
     * 不依赖「公开请求 UserContext 为空 → 租户拦截器放行」这个隐性契约。
     */
    private void fillReceivable(String receivableId, TicketData data, Long tenantId) {
        if (!StringUtils.hasText(receivableId)) {
            return;
        }
        try {
            Receivable r = receivableMapper.selectOne(new LambdaQueryWrapper<Receivable>()
                    .eq(Receivable::getId, Long.valueOf(receivableId))
                    .eq(Receivable::getTenantId, tenantId)
                    .last("LIMIT 1"));
            if (r != null) {
                data.setReceivableAmount(r.getAmount());
                data.setReceivableReceived(r.getReceivedAmount());
            }
        } catch (NumberFormatException e) {
            log.warn("[小票] receivableId 非法: {}", receivableId);
        }
    }

    private void fillReceivable(Long receivableId, TicketData data, Long tenantId) {
        if (receivableId == null) {
            return;
        }
        Receivable r = receivableMapper.selectOne(new LambdaQueryWrapper<Receivable>()
                .eq(Receivable::getId, receivableId)
                .eq(Receivable::getTenantId, tenantId)
                .last("LIMIT 1"));
        if (r != null) {
            data.setReceivableAmount(r.getAmount());
            data.setReceivableReceived(r.getReceivedAmount());
        }
    }


    /**
     * 手机号掩码：138****8888。 null / 非 11 位原样返回（不猜格式，避免把固话等改坏）。
     */
    static String maskPhone(String phone) {
        if (phone == null) {
            return null;
        }
        String p = phone.trim();
        if (p.length() != 11 || !p.chars().allMatch(Character::isDigit)) {
            return p;
        }
        return p.substring(0, 3) + "****" + p.substring(7);
    }

    /** 颜色 × 码数矩阵（保序：按明细出现顺序）。 */
    private List<Map<String, Object>> buildMatrix(List<TicketItemData> items) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        Map<String, Map<String, Integer>> byColor = new LinkedHashMap<>();
        for (TicketItemData it : items) {
            String color = it.getColor() == null ? "-" : it.getColor();
            String size = it.getSize() == null ? "-" : it.getSize();
            byColor.computeIfAbsent(color, k -> new LinkedHashMap<>())
                    .merge(size, it.getQuantity() == null ? 0 : it.getQuantity(), Integer::sum);
        }
        List<Map<String, Object>> matrix = new ArrayList<>();
        byColor.forEach((color, sizes) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("color", color);
            row.put("sizes", sizes);
            matrix.add(row);
        });
        return matrix;
    }

    /**
     * 款式图回填：SKU 颜色图优先，缺失回退款式封面（按 SKU.styleId 或明细自带 styleId）。
     * 出库单场景无 skuId，按 skuCode 反查 SKU。
     */
    private void fillImages(List<TicketItemData> items, Long tenantId) {
        if (items.isEmpty()) {
            return;
        }
        List<Long> skuIdList = items.stream().map(TicketItemData::getSkuId)
                .filter(Objects::nonNull).distinct().toList();
        Set<String> skuCodes = items.stream().map(TicketItemData::getSkuCode)
                .filter(StringUtils::hasText).collect(Collectors.toCollection(LinkedHashSet::new));

        Map<Long, ProductSku> bySkuId = skuIdList.isEmpty() ? Collections.emptyMap()
                : productSkuMapper.selectBatchIds(skuIdList).stream()
                        .collect(Collectors.toMap(ProductSku::getId, Function.identity(), (a, b) -> a));
        Map<String, ProductSku> bySkuCode = skuCodes.isEmpty() ? Collections.emptyMap()
                : productSkuMapper.selectList(new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getTenantId, tenantId)
                        .in(ProductSku::getSkuCode, skuCodes)).stream()
                        .collect(Collectors.toMap(ProductSku::getSkuCode, Function.identity(), (a, b) -> a));

        Set<Long> styleIds = new LinkedHashSet<>();
        for (TicketItemData it : items) {
            ProductSku sku = resolveSku(it, bySkuId, bySkuCode);
            if (sku != null && StringUtils.hasText(sku.getSkuColorImage())) {
                it.setImageUrl(sku.getSkuColorImage());
            }
            if (!StringUtils.hasText(it.getImageUrl())) {
                if (sku != null && sku.getStyleId() != null) {
                    styleIds.add(sku.getStyleId());
                }
                // 出库明细自带 styleId 是 String（UUID 时代兼容），解析为 Long 才能查款式表
                if (StringUtils.hasText(it.getStyleId())) {
                    Long sid = parseLongOrNull(it.getStyleId());
                    if (sid != null) {
                        styleIds.add(sid);
                    }
                }
            }
        }
        if (styleIds.isEmpty()) {
            return;
        }
        Map<Long, String> covers = styleInfoMapper.selectBatchIds(styleIds).stream()
                .filter(s -> StringUtils.hasText(s.getCover()))
                .collect(Collectors.toMap(StyleInfo::getId, StyleInfo::getCover, (a, b) -> a));
        if (covers.isEmpty()) {
            return;
        }
        for (TicketItemData it : items) {
            if (StringUtils.hasText(it.getImageUrl())) {
                continue;
            }
            ProductSku sku = resolveSku(it, bySkuId, bySkuCode);
            Long sid = (sku != null && sku.getStyleId() != null)
                    ? sku.getStyleId() : parseLongOrNull(it.getStyleId());
            if (sid != null) {
                it.setImageUrl(covers.get(sid));
            }
        }
    }

    private static Long parseLongOrNull(String v) {
        if (!StringUtils.hasText(v)) {
            return null;
        }
        try {
            return Long.valueOf(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private ProductSku resolveSku(TicketItemData it, Map<Long, ProductSku> bySkuId, Map<String, ProductSku> bySkuCode) {
        if (it.getSkuId() != null) {
            return bySkuId.get(it.getSkuId());
        }
        return it.getSkuCode() != null ? bySkuCode.get(it.getSkuCode()) : null;
    }
}
