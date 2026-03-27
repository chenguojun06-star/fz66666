package com.fashion.supplychain.production.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

@Slf4j
public final class OrderPricingSnapshotUtils {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private OrderPricingSnapshotUtils() {
    }

    public static BigDecimal resolveQuotationUnitPrice(String orderDetails) {
        return resolvePricingValue(orderDetails, "quotationUnitPrice");
    }

    public static BigDecimal resolveOrderUnitPrice(String orderDetails) {
        return resolvePricingValue(orderDetails, "orderUnitPrice");
    }

    public static BigDecimal resolveLockedOrderUnitPrice(BigDecimal factoryUnitPrice, String orderDetails) {
        BigDecimal snapshot = resolveOrderUnitPrice(orderDetails);
        if (snapshot.compareTo(BigDecimal.ZERO) > 0) {
            return snapshot;
        }
        if (factoryUnitPrice != null && factoryUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
            return factoryUnitPrice;
        }
        return BigDecimal.ZERO;
    }

    private static BigDecimal resolvePricingValue(String orderDetails, String fieldName) {
        if (!StringUtils.hasText(orderDetails) || !StringUtils.hasText(fieldName)) {
            return BigDecimal.ZERO;
        }
        try {
            Map<String, Object> root = OBJECT_MAPPER.readValue(orderDetails.trim(), new TypeReference<Map<String, Object>>() {});
            Object pricingRaw = root == null ? null : root.get("pricing");
            if (!(pricingRaw instanceof Map<?, ?> pricing)) {
                return BigDecimal.ZERO;
            }
            Object value = pricing.get(fieldName);
            if (value == null) {
                return BigDecimal.ZERO;
            }
            BigDecimal decimal = new BigDecimal(String.valueOf(value).trim());
            return decimal.compareTo(BigDecimal.ZERO) > 0 ? decimal : BigDecimal.ZERO;
        } catch (Exception e) {
            log.debug("Failed to resolve pricing snapshot field {}", fieldName, e);
            return BigDecimal.ZERO;
        }
    }
}
