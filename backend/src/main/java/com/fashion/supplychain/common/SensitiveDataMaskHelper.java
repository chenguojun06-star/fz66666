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

    public static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) {
            return phone;
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    public static void maskPhoneInMap(Map<String, Object> data) {
        if (data == null) {
            return;
        }
        maskPhoneKey(data, "phone");
        maskPhoneKey(data, "contactPhone");
        maskPhoneKey(data, "mobile");
        maskPhoneKey(data, "telephone");
    }

    public static void maskPhoneInMapList(List<Map<String, Object>> list) {
        if (list == null) {
            return;
        }
        for (Map<String, Object> data : list) {
            maskPhoneInMap(data);
        }
    }

    public static String maskIdCard(String idCard) {
        if (idCard == null || idCard.length() < 8) {
            return idCard;
        }
        return idCard.substring(0, 4) + "**********" + idCard.substring(idCard.length() - 4);
    }

    public static void maskSensitiveFieldsInMap(Map<String, Object> data) {
        if (data == null) {
            return;
        }
        maskPriceInMap(data);
        maskPhoneInMap(data);
        maskKey(data, "idCard", SensitiveDataMaskHelper::maskIdCard);
        maskKey(data, "idNumber", SensitiveDataMaskHelper::maskIdCard);
        maskKey(data, "password", v -> MASKED_VALUE);
    }

    private static void maskPriceKey(Map<String, Object> data, String key) {
        if (data.containsKey(key)) {
            data.put(key, MASKED_VALUE);
        }
    }

    private static void maskPhoneKey(Map<String, Object> data, String key) {
        Object val = data.get(key);
        if (val instanceof String s && !s.isBlank()) {
            data.put(key, maskPhone(s));
        }
    }

    private static void maskKey(Map<String, Object> data, String key, java.util.function.Function<String, String> masker) {
        Object val = data.get(key);
        if (val instanceof String s && !s.isBlank()) {
            data.put(key, masker.apply(s));
        }
    }
}
