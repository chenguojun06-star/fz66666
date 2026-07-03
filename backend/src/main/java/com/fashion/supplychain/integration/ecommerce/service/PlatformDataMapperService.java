package com.fashion.supplychain.integration.ecommerce.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class PlatformDataMapperService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @SuppressWarnings("unchecked")
    public Map<String, Object> mapToGeneric(String platformCode, String rawBody) {
        try {
            Map<String, Object> body = objectMapper.readValue(rawBody, Map.class);
            return switch (platformCode.toUpperCase()) {
                case "TAOBAO", "TMALL" -> mapTaobaoToGeneric(body);
                case "DOUYIN" -> mapDouyinToGeneric(body);
                case "PINDUODUO" -> mapPinduoduoToGeneric(body);
                case "JD" -> mapJdToGeneric(body);
                case "XIAOHONGSHU" -> mapXiaohongshuToGeneric(body);
                case "WECHAT_SHOP" -> mapWechatShopToGeneric(body);
                case "SHOPIFY" -> mapShopifyToGeneric(body);
                case "SHEIN" -> mapSheinToGeneric(body);
                case "JST" -> body;
                default -> body;
            };
        } catch (Exception e) {
            log.warn("[DataMapper] 解析{}数据失败: {}", platformCode, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> mapTaobaoToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "tid"));
        result.put("shopName", get(body, "seller_nick"));
        result.put("buyerNick", get(body, "buyer_nick"));
        result.put("receiverName", get(body, "receiver_name"));
        result.put("receiverPhone", get(body, "receiver_mobile", "receiver_phone"));
        result.put("receiverAddress", get(body, "receiver_address"));
        result.put("buyerRemark", get(body, "buyer_message"));

        Object orders = body.get("orders");
        if (orders instanceof List && !((List<?>) orders).isEmpty()) {
            Map<String, Object> item = (Map<String, Object>) ((List<?>) orders).get(0);
            result.put("skuCode", get(item, "outer_sku_id", "sku_id"));
            result.put("styleNo", get(item, "outer_iid"));
            result.put("properties", get(item, "sku_properties_name"));
            result.put("quantity", get(item, "num"));
            result.put("unitPrice", get(item, "price"));
            result.put("productName", get(item, "title"));
        }

        result.put("totalAmount", get(body, "total_fee"));
        result.put("payAmount", get(body, "payment"));
        result.put("freight", get(body, "post_fee"));
        result.put("discount", get(body, "discount_fee"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private Map<String, Object> mapDouyinToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_id"));
        result.put("shopName", get(body, "shop_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "post_addr", "name"));
        result.put("receiverPhone", get(body, "post_tel"));
        result.put("receiverAddress", get(body, "post_addr", "detail"));
        result.put("buyerRemark", get(body, "post_receiver_msg", "buyer_words"));

        Object items = body.get("order_item_list");
        if (items instanceof List && !((List<?>) items).isEmpty()) {
            Map<String, Object> item = (Map<String, Object>) ((List<?>) items).get(0);
            result.put("skuCode", get(item, "sku_id", "out_sku_id"));
            result.put("styleNo", get(item, "out_product_id"));
            result.put("properties", get(item, "spec_desc"));
            result.put("quantity", get(item, "item_num"));
            result.put("unitPrice", get(item, "price"));
            result.put("productName", get(item, "product_name"));
        }

        result.put("totalAmount", get(body, "order_total_amount"));
        result.put("payAmount", get(body, "pay_amount"));
        result.put("freight", get(body, "post_amount"));
        result.put("discount", get(body, "discount_amount"));
        result.put("payType", get(body, "pay_type_desc"));
        return result;
    }

    private Map<String, Object> mapPinduoduoToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_sn"));
        result.put("shopName", get(body, "mall_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "receiver_name"));
        result.put("receiverPhone", get(body, "receiver_phone"));
        result.put("receiverAddress", get(body, "receiver_address"));
        result.put("buyerRemark", get(body, "buyer_memo"));

        Object items = body.get("order_item_list");
        if (items instanceof List && !((List<?>) items).isEmpty()) {
            Map<String, Object> item = (Map<String, Object>) ((List<?>) items).get(0);
            result.put("skuCode", get(item, "outer_goods_id", "sku_id"));
            result.put("styleNo", get(item, "outer_id"));
            result.put("properties", get(item, "spec"));
            result.put("quantity", get(item, "goods_count"));
            result.put("unitPrice", get(item, "goods_price"));
            result.put("productName", get(item, "goods_name"));
        }

        result.put("totalAmount", get(body, "order_amount"));
        result.put("payAmount", get(body, "pay_amount"));
        result.put("freight", get(body, "shipping_amount"));
        result.put("discount", get(body, "discount_amount"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private Map<String, Object> mapJdToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "jd_order_id"));
        result.put("shopName", get(body, "shop_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "receiver_name"));
        result.put("receiverPhone", get(body, "receiver_phone"));
        result.put("receiverAddress", get(body, "receiver_address"));
        result.put("buyerRemark", get(body, "buyer_remark"));
        result.put("skuCode", get(body, "outer_sku_id"));
        result.put("styleNo", get(body, "outer_id"));
        result.put("quantity", get(body, "item_num"));
        result.put("unitPrice", get(body, "price"));
        result.put("productName", get(body, "product_name"));
        result.put("totalAmount", get(body, "order_total_price"));
        result.put("payAmount", get(body, "pay_price"));
        result.put("freight", get(body, "freight_price"));
        result.put("discount", get(body, "discount"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private Map<String, Object> mapXiaohongshuToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_id"));
        result.put("shopName", get(body, "shop_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "receiver_name"));
        result.put("receiverPhone", get(body, "receiver_phone"));
        result.put("receiverAddress", get(body, "receiver_address"));
        result.put("skuCode", get(body, "sku_id"));
        result.put("styleNo", get(body, "outer_id"));
        result.put("quantity", get(body, "num"));
        result.put("unitPrice", get(body, "price"));
        result.put("productName", get(body, "title"));
        result.put("totalAmount", get(body, "total_amount"));
        result.put("payAmount", get(body, "pay_amount"));
        result.put("freight", get(body, "freight"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private Map<String, Object> mapWechatShopToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_id"));
        result.put("shopName", get(body, "shop_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "receiver_name"));
        result.put("receiverPhone", get(body, "receiver_phone"));
        result.put("receiverAddress", get(body, "receiver_address"));
        result.put("skuCode", get(body, "sku_id"));
        result.put("styleNo", get(body, "outer_id"));
        result.put("quantity", get(body, "num"));
        result.put("unitPrice", get(body, "price"));
        result.put("productName", get(body, "title"));
        result.put("totalAmount", get(body, "total_amount"));
        result.put("payAmount", get(body, "pay_amount"));
        result.put("freight", get(body, "freight"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private Map<String, Object> mapShopifyToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_number"));
        result.put("shopName", get(body, "shop_name"));
        result.put("buyerNick", get(body, "buyer_name"));

        Object shipping = body.get("shipping_address");
        if (shipping instanceof Map) {
            Map<String, Object> addr = (Map<String, Object>) shipping;
            result.put("receiverName", get(addr, "name"));
            result.put("receiverPhone", get(addr, "phone"));
            result.put("receiverAddress", get(addr, "address1"));
        }

        Object items = body.get("line_items");
        if (items instanceof List && !((List<?>) items).isEmpty()) {
            Map<String, Object> item = (Map<String, Object>) ((List<?>) items).get(0);
            result.put("skuCode", get(item, "sku"));
            result.put("styleNo", get(item, "vendor"));
            result.put("quantity", get(item, "quantity"));
            result.put("unitPrice", get(item, "price"));
            result.put("productName", get(item, "title"));
        }

        result.put("totalAmount", get(body, "total_price"));
        result.put("payAmount", get(body, "total_price"));
        result.put("freight", get(body, "total_shipping"));
        result.put("discount", get(body, "total_discounts"));
        result.put("payType", get(body, "payment_gateway"));
        return result;
    }

    private Map<String, Object> mapSheinToGeneric(Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformOrderNo", get(body, "order_id", "order_no"));
        result.put("shopName", get(body, "shop_name", "store_name"));
        result.put("buyerNick", get(body, "buyer_name"));
        result.put("receiverName", get(body, "receiver_name", "consignee_name"));
        result.put("receiverPhone", get(body, "receiver_phone", "consignee_phone"));
        result.put("receiverAddress", get(body, "receiver_address", "consignee_address"));
        result.put("buyerRemark", get(body, "buyer_remark"));

        Object items = body.get("items");
        if (items instanceof List && !((List<?>) items).isEmpty()) {
            Map<String, Object> item = (Map<String, Object>) ((List<?>) items).get(0);
            result.put("skuCode", get(item, "sku_code", "sku_id"));
            result.put("styleNo", get(item, "style_no", "product_code"));
            result.put("properties", get(item, "spec_desc", "variant_desc"));
            result.put("quantity", get(item, "quantity"));
            result.put("unitPrice", get(item, "unit_price", "price"));
            result.put("productName", get(item, "product_name", "item_name"));
        }

        result.put("totalAmount", get(body, "total_amount", "order_total"));
        result.put("payAmount", get(body, "pay_amount", "paid_amount"));
        result.put("freight", get(body, "freight_amount", "shipping_fee"));
        result.put("discount", get(body, "discount_amount"));
        result.put("payType", get(body, "pay_type"));
        return result;
    }

    private String get(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object val = map.get(key);
            if (val != null) return val.toString();
        }
        return null;
    }
}