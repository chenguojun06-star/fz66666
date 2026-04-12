package com.fashion.supplychain.common;

import java.math.BigDecimal;
import java.util.Map;
import java.util.List;

public class SensitiveDataMaskHelper {

    private static final String MASKED_VALUE = "***";

    public static boolean shouldMaskPrice() {
        return UserContext.isFactoryUser();
    }

    public static BigDecimal maskPrice(BigDecimal price) {
        if (!shouldMaskPrice()) {
            return price;
        }
        return null;
    }

    public static void maskPriceInMap(Map<String, Object> data) {
        if (data == null || !shouldMaskPrice()) {
            return;
        }
        maskPriceKey(data, "unitPrice");
        maskPriceKey(data, "price");
        maskPriceKey(data, "factoryUnitPrice");
        maskPriceKey(data, "quotationUnitPrice");
        maskPriceKey(data, "costPrice");
        maskPriceKey(data, "totalPrice");
        maskPriceKey(data, "totalAmount");
        maskPriceKey(data, "amount");
    }

    public static void maskPriceInMapList(List<Map<String, Object>> list) {
        if (list == null || !shouldMaskPrice()) {
            return;
        }
        for (Map<String, Object> data : list) {
            maskPriceInMap(data);
        }
    }

    private static void maskPriceKey(Map<String, Object> data, String key) {
        if (data.containsKey(key)) {
            data.put(key, MASKED_VALUE);
        }
    }
}
