package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.entity.ShopOrder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 跨店结算编排（P1）。
 *
 * <p><b>核心规则：一次结算按店铺拆成多张订单，一张订单只含一个店铺。</b>
 * 每个店铺各自走既有 {@link ShopOrderOrchestrator#placeOrder}（独立事务、独立扣库存、
 * 独立挂应收），因此：
 * <ul>
 *   <li>资金与货权天然不跨店（与「各租户直收、平台不抽成」一致）；</li>
 *   <li>某一家店失败（打烊/缺货）**不会拖垮其他店** —— 逐店独立提交，
 *       结果逐店回报（这是 D-513 批量操作踩过坑后定下的口径：绝不整批一个事务）。</li>
 * </ul>
 *
 * <p>成功的店铺其购物车行会被清掉；失败的行**留在购物车里**，
 * 顾客可修正后重试，不需要重新挑选一遍。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopCheckoutOrchestrator {

    private final ShopCartOrchestrator cartOrchestrator;
    private final ShopOrderOrchestrator shopOrderOrchestrator;

    /**
     * 结算。
     *
     * @param tenantIds 只结算这些店铺；为空表示结算购物车里全部店铺
     */
    public Map<String, Object> checkout(String consumerId, String customerName, String phone,
                                        String address, String remark, List<Long> tenantIds) {
        if (!StringUtils.hasText(customerName) || !StringUtils.hasText(phone)
                || !StringUtils.hasText(address)) {
            throw new IllegalArgumentException("请填写收货人、联系电话和收货地址");
        }

        List<Map<String, Object>> rows = cartOrchestrator.rowsForCheckout(consumerId);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("购物车是空的");
        }

        // 按店铺分组（保持稳定顺序）
        Map<Long, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            Long tenantId = r.get("tenantId") == null ? null : Long.valueOf(String.valueOf(r.get("tenantId")));
            if (tenantId == null) {
                continue;
            }
            if (tenantIds != null && !tenantIds.isEmpty() && !tenantIds.contains(tenantId)) {
                continue;
            }
            groups.computeIfAbsent(tenantId, k -> new ArrayList<>()).add(r);
        }
        if (groups.isEmpty()) {
            throw new IllegalArgumentException("没有可结算的商品");
        }

        List<Map<String, Object>> results = new ArrayList<>();
        BigDecimal paidAmount = BigDecimal.ZERO;
        int successCount = 0;

        for (Map.Entry<Long, List<Map<String, Object>>> entry : groups.entrySet()) {
            Long tenantId = entry.getKey();
            List<Map<String, Object>> items = entry.getValue();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("tenantId", tenantId);
            result.put("shopName", items.get(0).get("shopName"));
            result.put("slug", items.get(0).get("slug"));

            // 先挑出失效行：整店一起失败（因为要一次性下单），但把原因说清楚
            String invalid = firstUnavailableReason(items);
            if (invalid != null) {
                result.put("success", false);
                result.put("message", invalid);
                results.add(result);
                continue;
            }

            List<Map<String, Object>> orderItems = new ArrayList<>();
            List<String> cartItemIds = new ArrayList<>();
            for (Map<String, Object> it : items) {
                Map<String, Object> oi = new LinkedHashMap<>();
                oi.put("skuId", it.get("skuId"));
                oi.put("quantity", it.get("quantity"));
                orderItems.add(oi);
                if (it.get("cartItemId") != null) {
                    cartItemIds.add(String.valueOf(it.get("cartItemId")));
                }
            }

            try {
                ShopOrder order = shopOrderOrchestrator.placeOrder(
                        String.valueOf(items.get(0).get("slug")),
                        customerName, phone, address, remark, orderItems, consumerId);
                result.put("success", true);
                result.put("orderNo", order.getOrderNo());
                result.put("totalAmount", order.getTotalAmount());
                result.put("goodsAmount", order.getGoodsAmount());
                result.put("shippingFee", order.getShippingFee());
                result.put("itemCount", order.getItemCount());
                successCount++;
                paidAmount = paidAmount.add(order.getTotalAmount() == null
                        ? BigDecimal.ZERO : order.getTotalAmount());
                // 只有下单成功才清购物车行
                cartOrchestrator.removeRows(cartItemIds);
            } catch (Exception e) {
                // 单店失败不拖累其他店：记下可读原因，购物车行保留待顾客处理
                log.warn("[ShopCheckout] 店铺下单失败 tenantId={} consumer={} err={}",
                        tenantId, consumerId, e.getMessage());
                result.put("success", false);
                result.put("message", e.getMessage() == null ? "下单失败，请稍后重试" : e.getMessage());
            }
            results.add(result);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orders", results);
        data.put("storeCount", groups.size());
        data.put("successCount", successCount);
        data.put("failedCount", groups.size() - successCount);
        data.put("paidAmount", paidAmount);
        return data;
    }

    /** 返回第一条不可买原因；全部可买返回 null */
    private String firstUnavailableReason(List<Map<String, Object>> items) {
        for (Map<String, Object> it : items) {
            Object available = it.get("available");
            if (!Boolean.TRUE.equals(available)) {
                String name = it.get("styleName") == null ? "商品" : String.valueOf(it.get("styleName"));
                String reason = it.get("unavailableReason") == null
                        ? "不可购买" : String.valueOf(it.get("unavailableReason"));
                return name + "：" + reason;
            }
        }
        return null;
    }
}
