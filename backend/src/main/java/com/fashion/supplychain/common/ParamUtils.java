package com.fashion.supplychain.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.StringUtils;

public final class ParamUtils {
    private static final Logger log = LoggerFactory.getLogger(ParamUtils.class);

    private ParamUtils() {
    }

    public static Object getIgnoreCase(Map<String, ?> map, String key) {
        if (map == null || map.isEmpty() || !StringUtils.hasText(key)) {
            return null;
        }
        if (map.containsKey(key)) {
            return map.get(key);
        }
        String lk = key.trim().toLowerCase();
        for (Map.Entry<String, ?> e : map.entrySet()) {
            if (e == null) {
                continue;
            }
            String k = e.getKey();
            if (k != null && k.trim().toLowerCase().equals(lk)) {
                return e.getValue();
            }
        }
        return null;
    }

    public static String toTrimmedString(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v);
        s = s == null ? null : s.trim();
        return StringUtils.hasText(s) ? s : null;
    }

    public static int toIntSafe(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        String s = String.valueOf(v);
        if (!StringUtils.hasText(s)) {
            return 0;
        }
        try {
            return new BigDecimal(s.trim()).setScale(0, RoundingMode.HALF_UP).intValue();
        } catch (Exception e) {
            log.warn("Failed to parse int value: value={}", v, e);
            return 0;
        }
    }

    public static int getIntOrDefault(Map<String, ?> params, String key, int defaultValue) {
        if (params == null || params.isEmpty() || !StringUtils.hasText(key)) {
            return defaultValue;
        }
        Object v = params.get(key);
        if (v == null) {
            v = getIgnoreCase(params, key);
        }
        if (v == null) {
            return defaultValue;
        }

        if (v instanceof Number) {
            return ((Number) v).intValue();
        }

        String s = String.valueOf(v);
        s = s == null ? null : s.trim();
        if (!StringUtils.hasText(s) || "undefined".equalsIgnoreCase(s)) {
            return defaultValue;
        }

        try {
            return new BigDecimal(s).setScale(0, RoundingMode.HALF_UP).intValue();
        } catch (Exception e) {
            log.warn("Failed to parse int value: key={}, value={}", key, v, e);
            return defaultValue;
        }
    }

    public static long getLongOrDefault(Map<String, ?> params, String key, long defaultValue) {
        if (params == null || params.isEmpty() || !StringUtils.hasText(key)) {
            return defaultValue;
        }
        Object v = params.get(key);
        if (v == null) {
            v = getIgnoreCase(params, key);
        }
        if (v == null) {
            return defaultValue;
        }

        if (v instanceof Number) {
            return ((Number) v).longValue();
        }

        String s = String.valueOf(v);
        s = s == null ? null : s.trim();
        if (!StringUtils.hasText(s) || "undefined".equalsIgnoreCase(s)) {
            return defaultValue;
        }

        try {
            return new BigDecimal(s).setScale(0, RoundingMode.HALF_UP).longValue();
        } catch (Exception e) {
            log.warn("Failed to parse long value: key={}, value={}", key, v, e);
            return defaultValue;
        }
    }

    public static int getPage(Map<String, ?> params) {
        int page = getIntOrDefault(params, "page", 1);
        return page <= 0 ? 1 : page;
    }

    public static int getPageSize(Map<String, ?> params) {
        int size = getIntOrDefault(params, "pageSize", 10);
        return size <= 0 ? 10 : size;
    }

    public static int getPageSizeClamped(Map<String, ?> params, int defaultValue, int minValue, int maxValue) {
        int size = getIntOrDefault(params, "pageSize", defaultValue);
        size = Math.max(minValue, size);
        if (maxValue > 0) {
            size = Math.min(maxValue, size);
        }
        return size;
    }

    public static long getPageLong(Map<String, ?> params) {
        long page = getLongOrDefault(params, "page", 1L);
        return page <= 0 ? 1L : page;
    }

    public static long getPageSizeLong(Map<String, ?> params) {
        long size = getLongOrDefault(params, "pageSize", 10L);
        return size <= 0 ? 10L : size;
    }

    public static long getPageSizeLongClamped(Map<String, ?> params, long defaultValue, long minValue, long maxValue) {
        long size = getLongOrDefault(params, "pageSize", defaultValue);
        size = Math.max(minValue, size);
        if (maxValue > 0) {
            size = Math.min(maxValue, size);
        }
        return size;
    }
}
