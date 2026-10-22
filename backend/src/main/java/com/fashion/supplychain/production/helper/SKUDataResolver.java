package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
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
    @Autowired
    private ProductSkuService productSkuService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * P0 修复（铁律4 多租户隔离）：缓存键必须含 tenantId，防止跨租户串数据。
     * 旧逻辑键为 orderNo（String），若两个租户存在相同 orderNo 会导致订单详情数据串通；
     * 修复后键为 tenantId + ":" + orderNo，显式按租户隔离。
     */
    private final Cache<String, List<Map<String, Object>>> orderDetailsCache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(1000)
            .build();

    private static String buildCacheKey(String orderNo) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return (tenantId == null ? "0" : tenantId.toString()) + ":" + orderNo;
    }

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
        } catch (Exception e) { log.warn("订单明细解析失败（非关键路径，按空列表兜底）: {}", e.getMessage()); }
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
        } catch (Exception e) { log.warn("订单明细解析失败（非关键路径，按空列表兜底）: {}", e.getMessage()); }
        return List.of();
    }

    public List<Map<String, Object>> resolveSkuListFromOrderDetails(String orderNo) {
        String cacheKey = buildCacheKey(orderNo);
        List<Map<String, Object>> cached = orderDetailsCache.getIfPresent(cacheKey);
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

        // D-836 扫码通：一次查全该款 SKU 的机读码（barcode）映射，put 进每行 ——
        // 合格证/吊牌的 CODE128 条码打它，POS 与仓库扫码认它。
        // 生产标签是"按款出标"，同一款的色码组合有限，一次 IN 查询足够（不 N+1）。
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId != null && StringUtils.hasText(styleNo)) {
                List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getTenantId, tenantId)
                        .eq(ProductSku::getStyleNo, styleNo.trim())
                        .select(ProductSku::getColor, ProductSku::getSize, ProductSku::getSkuCode,
                                ProductSku::getBarcode));
                Map<String, String> skuInfo = new HashMap<>();
                for (ProductSku k : skus) {
                    if (k == null) {
                        continue;
                    }
                    String key = String.valueOf(k.getColor()).trim() + "|" + String.valueOf(k.getSize()).trim();
                    skuInfo.put(key, StringUtils.hasText(k.getBarcode())
                            ? k.getBarcode().trim() : String.valueOf(k.getSkuCode()));
                }
                for (Map<String, Object> m : result) {
                    String key = String.valueOf(m.get("color")).trim() + "|" + String.valueOf(m.get("size")).trim();
                    String info = skuInfo.get(key);
                    if (StringUtils.hasText(info)) {
                        m.put("barcode", info);
                    }
                }
            }
        } catch (Exception e) {
            // 机读码缺失不该阻断标签打印（老行为：没码也出得了标签），降级为不带码
            log.warn("[SKUDataResolver] 机读码查询失败，标签将不带条码: orderNo={}, err={}", on, e.getMessage());
        }

        orderDetailsCache.put(cacheKey, result);
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
        // 中文聚合标签：自定义裁剪单订单级 color/size 在多种取值时回退为"多色"/"多码"/"多种"
        // 这些值不可能精确匹配 orderDetails 中的具体 SKU 行，必须按复合值处理跳过精确比对
        if ("多色".equals(v) || "多码".equals(v) || "多种".equals(v) || "多".equals(v)
                || "MULTI".equalsIgnoreCase(v) || "MIXED".equalsIgnoreCase(v)) {
            return true;
        }
        return v.contains(",") || v.contains("，") || v.contains("/") || v.contains("、") || v.contains(";")
                || v.contains("|") || v.contains(" ");
    }
}
