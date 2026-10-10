package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.shop.entity.ShopCartItem;
import com.fashion.supplychain.shop.mapper.ShopCartItemMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import com.fashion.supplychain.shop.mapper.ShopStatDailyMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台级跨店购物车编排（P1）。
 *
 * <p>一辆车装多个店铺的商品（{@code consumer_id} 归属），结算时按店铺分组、
 * 逐店下单 —— 所以**一张订单仍然只含一个店铺**，资金与货权不跨店。
 *
 * <p><b>失效商品要显示而不是消失</b>：已下架 / 店铺打烊 / 库存不足的商品
 * 仍然返回给前端，并带上 {@code available=false} 与可读原因。
 * 静默过滤会让顾客以为商品被吞了，且结算时才报错更糟。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopCartOrchestrator {

    /** 单条购物车项的最大数量（防误操作把库存一次买空） */
    private static final int MAX_QUANTITY = 999;
    /** 单车最大行数 */
    private static final int MAX_LINES = 100;

    private final ShopCartItemMapper cartItemMapper;
    private final ShopPlatformMapper platformMapper;
    private final ProductSkuService productSkuService;
    private final StyleInfoService styleInfoService;
    /** 加购计数（数据看板用）：购物车行结算后会被删除，事后算不出「当天加购几次」 */
    private final ShopStatDailyMapper statDailyMapper;

    /** 购物车（按店铺分组 + 汇总） */
    public Map<String, Object> cart(String consumerId) {
        List<Map<String, Object>> rows = enrich(platformMapper.listCartRows(consumerId));

        // 按店铺分组：前端直接按组渲染，不必自己聚合
        Map<Long, Map<String, Object>> groups = new LinkedHashMap<>();
        BigDecimal validAmount = BigDecimal.ZERO;
        int itemCount = 0;
        for (Map<String, Object> r : rows) {
            Long tenantId = toLong(r.get("tenantId"));
            Map<String, Object> g = groups.computeIfAbsent(tenantId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("tenantId", tenantId);
                m.put("slug", r.get("slug"));
                m.put("shopName", r.get("shopName"));
                m.put("shopEnabled", r.get("shopEnabled"));
                m.put("items", new ArrayList<Map<String, Object>>());
                return m;
            });
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) g.get("items");
            items.add(r);

            int qty = toInt(r.get("quantity"));
            itemCount += qty;
            if (Boolean.TRUE.equals(r.get("available"))) {
                validAmount = validAmount.add(new BigDecimal(String.valueOf(r.get("amount"))));
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("groups", new ArrayList<>(groups.values()));
        data.put("itemCount", itemCount);
        data.put("lineCount", rows.size());
        data.put("validAmount", validAmount.setScale(2, RoundingMode.HALF_UP));
        return data;
    }

    /** 加购（同 SKU 累加；超出库存或上限时拒绝并给出可读原因） */
    @Transactional(rollbackFor = Exception.class)
    public void add(String consumerId, Long skuId, int quantity) {
        if (skuId == null) {
            throw new IllegalArgumentException("缺少商品规格");
        }
        int qty = quantity <= 0 ? 1 : quantity;
        if (qty > MAX_QUANTITY) {
            throw new IllegalArgumentException("单个商品一次最多 " + MAX_QUANTITY + " 件");
        }
        ProductSku sku = productSkuService.getById(skuId);
        if (sku == null) {
            throw new IllegalArgumentException("商品不存在或已下架");
        }
        StyleInfo style = sku.getStyleId() == null ? null : styleInfoService.getById(sku.getStyleId());
        if (style == null || style.getShopListed() == null || style.getShopListed() != 1) {
            throw new IllegalArgumentException("商品已下架");
        }
        int stock = sku.getStockQuantity() == null ? 0 : sku.getStockQuantity();
        if (stock <= 0) {
            throw new IllegalArgumentException("该规格暂时缺货");
        }

        ShopCartItem existing = cartItemMapper.selectOne(new LambdaQueryWrapper<ShopCartItem>()
                .eq(ShopCartItem::getConsumerId, consumerId)
                .eq(ShopCartItem::getSkuId, skuId)
                .last("LIMIT 1"));

        int target = (existing == null ? 0 : toInt(existing.getQuantity())) + qty;
        if (target > stock) {
            throw new IllegalArgumentException("库存仅剩 " + stock + " 件"
                    + (existing == null ? "" : "（购物车已有 " + existing.getQuantity() + " 件）"));
        }
        if (target > MAX_QUANTITY) {
            throw new IllegalArgumentException("单个商品一次最多 " + MAX_QUANTITY + " 件");
        }

        if (existing == null) {
            long lines = cartItemMapper.selectCount(new LambdaQueryWrapper<ShopCartItem>()
                    .eq(ShopCartItem::getConsumerId, consumerId));
            if (lines >= MAX_LINES) {
                throw new IllegalArgumentException("购物车最多 " + MAX_LINES + " 种商品，请先结算或清理");
            }
            ShopCartItem row = new ShopCartItem();
            row.setConsumerId(consumerId);
            row.setTenantId(sku.getTenantId());
            row.setSkuId(skuId);
            row.setQuantity(target);
            cartItemMapper.insert(row);
        } else {
            ShopCartItem patch = new ShopCartItem();
            patch.setId(existing.getId());
            patch.setQuantity(target);
            cartItemMapper.updateById(patch);
        }

        // 加购计数（数据看板）：与购物车行同一个事务，回滚时计数一并回滚，不会虚高。
        // 统计失败不影响加购本身（顾客能不能买成，比看板数字重要）。
        try {
            statDailyMapper.bumpCartAdd(sku.getTenantId());
        } catch (Exception e) {
            log.debug("[ShopCart] 加购计数失败 tenant={} err={}", sku.getTenantId(), e.getMessage());
        }
    }

    /** 改数量（quantity<=0 视为删除该行） */
    @Transactional(rollbackFor = Exception.class)
    public void updateQuantity(String consumerId, String cartItemId, int quantity) {
        ShopCartItem row = requireOwn(consumerId, cartItemId);
        if (quantity <= 0) {
            cartItemMapper.deleteById(row.getId());
            return;
        }
        if (quantity > MAX_QUANTITY) {
            throw new IllegalArgumentException("单个商品一次最多 " + MAX_QUANTITY + " 件");
        }
        ProductSku sku = productSkuService.getById(row.getSkuId());
        int stock = sku == null || sku.getStockQuantity() == null ? 0 : sku.getStockQuantity();
        if (quantity > stock) {
            throw new IllegalArgumentException("库存仅剩 " + stock + " 件");
        }
        ShopCartItem patch = new ShopCartItem();
        patch.setId(row.getId());
        patch.setQuantity(quantity);
        cartItemMapper.updateById(patch);
    }

    @Transactional(rollbackFor = Exception.class)
    public void remove(String consumerId, String cartItemId) {
        ShopCartItem row = requireOwn(consumerId, cartItemId);
        cartItemMapper.deleteById(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void clear(String consumerId) {
        cartItemMapper.delete(new LambdaQueryWrapper<ShopCartItem>()
                .eq(ShopCartItem::getConsumerId, consumerId));
    }

    /** 购物车行数（顶部角标用） */
    public int lineCount(String consumerId) {
        return Math.toIntExact(cartItemMapper.selectCount(new LambdaQueryWrapper<ShopCartItem>()
                .eq(ShopCartItem::getConsumerId, consumerId)));
    }

    /** 结算用：购物车明细（含失效标记），按店铺分组 */
    public List<Map<String, Object>> rowsForCheckout(String consumerId) {
        return enrich(platformMapper.listCartRows(consumerId));
    }

    /** 结算成功后清掉这些行 */
    @Transactional(rollbackFor = Exception.class)
    public void removeRows(List<String> cartItemIds) {
        if (cartItemIds == null || cartItemIds.isEmpty()) {
            return;
        }
        cartItemMapper.delete(new LambdaQueryWrapper<ShopCartItem>()
                .in(ShopCartItem::getId, cartItemIds));
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    private ShopCartItem requireOwn(String consumerId, String cartItemId) {
        ShopCartItem row = cartItemMapper.selectOne(new LambdaQueryWrapper<ShopCartItem>()
                .eq(ShopCartItem::getId, cartItemId)
                .eq(ShopCartItem::getConsumerId, consumerId)
                .last("LIMIT 1"));
        if (row == null) {
            throw new IllegalArgumentException("购物车中没有这条商品");
        }
        return row;
    }

    /** 给每行补上「是否可买 / 为什么不能买 / 小计金额」 */
    private List<Map<String, Object>> enrich(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (rows == null) {
            return out;
        }
        for (Map<String, Object> r : rows) {
            Map<String, Object> row = new LinkedHashMap<>(r);
            int qty = toInt(r.get("quantity"));
            BigDecimal price = toDecimal(r.get("salesPrice"));
            row.put("quantity", qty);
            row.put("amount", price == null
                    ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                    : price.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP));

            int stock = toInt(r.get("stockQuantity"));
            String reason = null;
            if (r.get("skuId") == null || r.get("styleId") == null) {
                reason = "商品已不存在";
            } else if (!"1".equals(String.valueOf(r.get("shopListed")))) {
                reason = "商品已下架";
            } else if (!"1".equals(String.valueOf(r.get("shopEnabled")))) {
                reason = "店铺已打烊";
            } else if (stock < qty) {
                reason = stock <= 0 ? "已售罄" : ("库存仅剩 " + stock + " 件");
            }
            row.put("available", reason == null);
            row.put("unavailableReason", reason);
            out.add(row);
        }
        return out;
    }

    private static int toInt(Object v) {
        if (v == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static BigDecimal toDecimal(Object v) {
        if (v == null) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
