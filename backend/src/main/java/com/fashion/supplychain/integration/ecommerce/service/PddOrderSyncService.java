package com.fashion.supplychain.integration.ecommerce.service;

import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformApiSupport;
import com.fashion.supplychain.integration.sync.dto.EcSyncContext;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 拼多多订单拉取服务（D-589 直连拉单样板）。
 *
 * <p>链路：{@code pdd.order.number.list.increment} 按更新时间增量拿订单号列表
 * → 逐单 {@code pdd.order.information.get} 拉详情 → 映射为 Webhook body
 * → {@link EcommerceOrderOrchestrator#receiveOrder} 幂等入库（平台单号去重）。
 *
 * <p>令牌来自 t_ec_platform_config（D-587 OAuth 授权落库）；签名走
 * {@link EcPlatformApiSupport}（type/client_id + MD5）。
 *
 * <p><b>已知边界（线上联调时校准）</b>：
 * <ul>
 *   <li>收件人姓名/电话受拼多多隐私保护，未申请解密权限时为脱敏值；</li>
 *   <li>金额字段单位为「分」，统一 /100 转元；</li>
 *   <li>增量窗口最长 24 小时，历史订单由该窗口滚动逐步带入。</li>
 * </ul>
 */
@Slf4j
@Service
public class PddOrderSyncService {

    private static final String API_URL = "https://gw-api.pinduoduo.com/api/router";
    private static final DateTimeFormatter PDD_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int PAGE_SIZE = 100;
    private static final int MAX_PAGES = 20;

    @Autowired
    private IntegrationHttpClient httpClient;

    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    /**
     * 增量拉取订单并幂等入库。
     *
     * @param config 平台配置（须含 access_token）
     * @param since  增量起点（null = 近 24 小时）
     */
    public Map<String, Object> pullOrders(EcPlatformConfig config, LocalDateTime since) {
        if (config.getAccessToken() == null || config.getAccessToken().isBlank()) {
            throw new IllegalStateException("缺少访问令牌：请先完成平台授权（向导第三步「去平台授权」）");
        }
        EcSyncContext ctx = EcSyncContext.builder()
                .tenantId(config.getTenantId())
                .platformCode(config.getPlatformCode())
                .appId(config.getAppKey())
                .appSecret(config.getAppSecret())
                .accessToken(config.getAccessToken())
                .build();

        LocalDateTime end = LocalDateTime.now();
        LocalDateTime start = since != null ? since : end.minusHours(24);

        int synced = 0;
        int skipped = 0;
        int page = 1;
        boolean hasMore = true;

        while (hasMore && page <= MAX_PAGES) {
            Map<String, Object> biz = new LinkedHashMap<>();
            biz.put("order_status", 5); // 5 = 全部状态
            biz.put("page_size", PAGE_SIZE);
            biz.put("page", page);
            biz.put("update_datetime_start", start.format(PDD_TS));
            biz.put("update_datetime_end", end.format(PDD_TS));

            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.TYPE_KEY, "pdd.order.number.list.increment", biz);

            Object listObj = resp.get("order_list");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> orderList = listObj instanceof List ? (List<Map<String, Object>>) listObj : null;
            if (orderList == null || orderList.isEmpty()) {
                break;
            }

            for (Map<String, Object> brief : orderList) {
                String orderSn = brief.get("order_sn") == null ? null : String.valueOf(brief.get("order_sn"));
                if (orderSn == null || orderSn.isBlank()) continue;
                try {
                    Map<String, Object> detailResp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                            EcPlatformApiSupport.TYPE_KEY, "pdd.order.information.get",
                            Map.of("order_sn", orderSn));
                    Object infoObj = detailResp.get("order_info");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> orderInfo = infoObj instanceof Map ? (Map<String, Object>) infoObj : null;
                    if (orderInfo == null) {
                        skipped++;
                        continue;
                    }
                    Map<String, Object> body = mapPddOrderToBody(orderInfo, shopNameOf(config));
                    Map<String, Object> result = ecommerceOrderOrchestrator.receiveOrder("PINDUODUO", body, config.getTenantId());
                    if (Boolean.TRUE.equals(result.get("duplicate"))) {
                        skipped++;
                    } else {
                        synced++;
                    }
                } catch (Exception e) {
                    log.warn("[拼多多拉单] 单笔订单入库失败: orderSn={}, err={}", orderSn, e.getMessage());
                    skipped++;
                }
            }

            if (orderList.size() < PAGE_SIZE) {
                hasMore = false;
            }
            page++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platform", "PINDUODUO");
        result.put("synced", synced);
        result.put("skipped", skipped);
        result.put("windowStart", start.format(PDD_TS));
        result.put("windowEnd", end.format(PDD_TS));
        log.info("[拼多多拉单] 完成: synced={}, skipped={}, window=[{} ~ {}]",
                synced, skipped, start.format(PDD_TS), end.format(PDD_TS));
        return result;
    }

    private static String shopNameOf(EcPlatformConfig config) {
        return config.getShopName() != null ? config.getShopName() : "拼多多店铺";
    }

    /**
     * 拼多多订单详情 → Webhook body。字段做宽容解析（平台响应结构联调时进一步校准）。
     */
    private Map<String, Object> mapPddOrderToBody(Map<String, Object> orderInfo, String shopName) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("platformOrderNo", str(orderInfo.get("order_sn")));
        body.put("shopName", shopName);
        body.put("buyerNick", firstNonBlank(orderInfo.get("buyer_user_name"), orderInfo.get("buyer_nick")));

        // 收件人：未申请解密权限时为平台脱敏值，如实落库
        body.put("receiverName", firstNonBlank(orderInfo.get("receiver_name"), orderInfo.get("receiver_name_mask")));
        body.put("receiverPhone", firstNonBlank(orderInfo.get("receiver_phone"), orderInfo.get("receiver_phone_mask")));
        body.put("receiverAddress", joinAddress(orderInfo));

        body.put("buyerRemark", firstNonBlank(orderInfo.get("buyer_memo"), orderInfo.get("remark")));
        body.put("payType", "PDD");

        // 商品：SKU 列表聚合成单行（productName 取首件名称，quantity 求和，skuCode 优先商家编码）
        Object listObj = orderInfo.get("item_list");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = listObj instanceof List ? (List<Map<String, Object>>) listObj : List.of();
        if (!items.isEmpty()) {
            body.put("productName", items.stream()
                    .map(i -> str(i.get("goods_name")))
                    .filter(n -> n != null && !n.isBlank())
                    .collect(Collectors.joining("；")));
            Map<String, Object> first = items.get(0);
            body.put("skuCode", firstNonBlank(first.get("outer_goods_id"), first.get("outer_id"), first.get("sku_id")));
            int totalQty = 0;
            for (Map<String, Object> i : items) {
                Object cnt = i.get("goods_count");
                if (cnt instanceof Number n) totalQty += n.intValue();
            }
            body.put("quantity", Math.max(totalQty, 1));
            // 单价 = 商品总额 / 总数量（分 → 元）
            Object goodsAmount = orderInfo.get("goods_amount");
            if (goodsAmount instanceof Number n && totalQty > 0) {
                body.put("unitPrice", fenToYuan(n.longValue()).divide(
                        java.math.BigDecimal.valueOf(totalQty), 2, java.math.RoundingMode.HALF_UP).toPlainString());
            }
        } else {
            body.put("quantity", 1);
        }

        // 金额：拼多多单位为分，统一转元字符串（receiveOrder 内转 BigDecimal）
        body.put("payAmount", fenToYuanStr(orderInfo.get("pay_amount")));
        body.put("totalAmount", fenToYuanStr(firstNonBlank(orderInfo.get("goods_amount"), orderInfo.get("pay_amount"))));
        body.put("freight", fenToYuanStr(orderInfo.get("postage")));
        Object discount = orderInfo.get("discount_amount");
        if (discount instanceof Number n && n.longValue() > 0) {
            body.put("discount", fenToYuanStr(discount));
        }
        return body;
    }

    private static String joinAddress(Map<String, Object> orderInfo) {
        // 优先完整地址字段；缺失时按省/市/区/镇/明细拼接
        Object full = orderInfo.get("address");
        if (full != null && !String.valueOf(full).isBlank()) {
            return String.valueOf(full);
        }
        List<String> parts = new ArrayList<>();
        for (String k : new String[]{"province", "city", "county", "town", "address_detail"}) {
            Object v = orderInfo.get(k);
            if (v != null && !String.valueOf(v).isBlank()) parts.add(String.valueOf(v));
        }
        return String.join(" ", parts);
    }

    private static String fenToYuanStr(Object fen) {
        if (fen instanceof Number n) {
            return fenToYuan(n.longValue()).toPlainString();
        }
        return null;
    }

    private static java.math.BigDecimal fenToYuan(long fen) {
        return java.math.BigDecimal.valueOf(fen).divide(java.math.BigDecimal.valueOf(100));
    }

    private static String firstNonBlank(Object... values) {
        for (Object v : values) {
            if (v != null) {
                String s = String.valueOf(v);
                if (!s.isBlank()) return s;
            }
        }
        return null;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
