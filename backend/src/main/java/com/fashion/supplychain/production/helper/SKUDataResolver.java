package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * SKU数据解析辅助类
 *
 * 从SKUServiceImpl中提取的数据解析逻辑：
 * - 订单查询与缓存
 * - 订单明细JSON解析
 * - SKU列表聚合
 * - SKU数量计算
 */
@Component
@Slf4j
public class SKUDataResolver {

    @Autowired
    private ProductionOrderService productionOrderService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Cache<String, List<Map<String, Object>>> orderDetailsCache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(1000)
            .build();

    public ProductionOrder getActiveOrderByNo(String orderNo) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : null;
        if (!StringUtils.hasText(on)) {
            return null;
        }
        try {
            return productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getOrderNo, on)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .last("limit 1"));
        } catch (Exception e) {
            log.warn("[SKUService] 查询订单失败: {}", on, e);
            return null;
        }
    }

    public List<Map<String, Object>> resolveOrderLines(String details) {
        if (!StringUtils.hasText(details)) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(details,
                    new TypeReference<List<Map<String, Object>>>() {
                    });
            if (list != null) {
                return list;
            }
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        try {
            Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
            });
            Object lines = obj == null ? null
                    : (obj.get("lines") != null ? obj.get("lines")
                            : (obj.get("items") != null ? obj.get("items")
                                    : (obj.get("details") != null ? obj.get("details")
                                            : (obj.get("orderLines") != null ? obj.get("orderLines")
                                                    : obj.get("list")))));
            if (lines instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                return cast;
            }
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        return List.of();
    }

    public List<Map<String, Object>> resolveSkuListFromOrderDetails(String orderNo) {
        List<Map<String, Object>> cached = orderDetailsCache.getIfPresent(orderNo);
        if (cached != null) {
            return cached;
        }

        ProductionOrder order = getActiveOrderByNo(orderNo);
        if (order == null || !StringUtils.hasText(order.getOrderDetails())) {
            return List.of();
        }
        List<Map<String, Object>> lines = resolveOrderLines(order.getOrderDetails());
        if (lines == null || lines.isEmpty()) {
            return List.of();
        }
        String styleNo = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : "";
        String on = StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo().trim() : "";
        Map<String, Map<String, Object>> agg = new LinkedHashMap<>();
        for (Map<String, Object> r : lines) {
            if (r == null || r.isEmpty()) {
                continue;
            }
            String color = StringUtils.hasText(ParamUtils.toTrimmedString(r.get("color")))
                    ? ParamUtils.toTrimmedString(r.get("color"))
                    : "";
            String size = StringUtils.hasText(ParamUtils.toTrimmedString(r.get("size")))
                    ? ParamUtils.toTrimmedString(r.get("size"))
                    : "";
            if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                continue;
            }
            int qty = parseQuantity(r.get("quantity"));
            String key = color + "|" + size;
            Map<String, Object> sku = agg.computeIfAbsent(key, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("orderNo", on);
                m.put("styleNo", styleNo);
                m.put("color", color);
                m.put("size", size);
                m.put("skuKey", String.format("%s:%s:%s:%s",
                        StringUtils.hasText(on) ? on.trim() : "",
                        StringUtils.hasText(styleNo) ? styleNo.trim() : "",
                        StringUtils.hasText(color) ? color.trim() : "",
                        StringUtils.hasText(size) ? size.trim() : ""));
                m.put("quantity", 0);
                return m;
            });
            int current = parseQuantity(sku.get("quantity"));
            sku.put("quantity", current + Math.max(0, qty));
        }

        List<Map<String, Object>> result = new ArrayList<>(agg.values());
        orderDetailsCache.put(orderNo, result);
        return result;
    }

    public int parseQuantity(Object obj) {
        if (obj == null) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(obj).trim()));
        } catch (Exception e) {
            return 0;
        }
    }

    public long getOrderSkuQuantity(String orderNo, String styleNo, String color, String size) {
        List<Map<String, Object>> list = resolveSkuListFromOrderDetails(orderNo);
        if (list == null || list.isEmpty()) {
            return 0;
        }
        String c = StringUtils.hasText(color) ? color.trim() : "";
        String s = StringUtils.hasText(size) ? size.trim() : "";
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        long total = 0;
        for (Map<String, Object> sku : list) {
            if (sku == null || sku.isEmpty()) {
                continue;
            }
            String sc = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("color")))
                    ? ParamUtils.toTrimmedString(sku.get("color"))
                    : "";
            String ss = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("size")))
                    ? ParamUtils.toTrimmedString(sku.get("size"))
                    : "";
            String st = StringUtils.hasText(ParamUtils.toTrimmedString(sku.get("styleNo")))
                    ? ParamUtils.toTrimmedString(sku.get("styleNo"))
                    : "";
            if (!c.equals(sc) || !s.equals(ss)) {
                continue;
            }
            if (StringUtils.hasText(sn) && StringUtils.hasText(st) && !sn.equals(st)) {
                continue;
            }
            total += parseQuantity(sku.get("quantity"));
        }
        return total;
    }

    public boolean isCompositeValue(String value) {
        if (!StringUtils.hasText(value)) {
            return false;
        }
        String v = value.trim();
        return v.contains(",") || v.contains("，") || v.contains("/") || v.contains("、") || v.contains(";")
                || v.contains("|") || v.contains(" ");
    }
}
