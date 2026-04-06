package com.fashion.supplychain.template.helper;

import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class TemplateParseUtils {

    private TemplateParseUtils() {} // utility class

    static Map<String, Object> coerceMap(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> mapped = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                if (entry.getKey() == null) {
                    continue;
                }
                mapped.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return mapped;
        }
        return new LinkedHashMap<>();
    }

    static List<Map<String, Object>> coerceListOfMap(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return List.of();
        }
        List<Map<String, Object>> mapped = new ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof Map<?, ?>) {
                mapped.add(coerceMap(item));
            }
        }
        return mapped;
    }

    static List<String> coerceListOfString(Object value) {
        if (!(value instanceof List<?> rawList)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Object item : rawList) {
            if (item == null) {
                continue;
            }
            String text = String.valueOf(item).trim();
            if (StringUtils.hasText(text)) {
                out.add(text);
            }
        }
        return out;
    }

    static BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        try {
            String text = String.valueOf(value).trim();
            if (!StringUtils.hasText(text)) {
                return null;
            }
            return new BigDecimal(text);
        } catch (Exception e) {
            return null;
        }
    }

}
