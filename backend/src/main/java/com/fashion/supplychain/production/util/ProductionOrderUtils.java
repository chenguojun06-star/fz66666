package com.fashion.supplychain.production.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 生产订单工具类
 * 提供通用的工具方法
 */
@Slf4j
public class ProductionOrderUtils {

    // 尺码排序解析用正则预编译：避免在比较过程中重复编译，降低开销
    private static final Pattern PATTERN_NUMERIC_SIZE = Pattern.compile("^\\d+(\\.\\d+)?$");
    private static final Pattern PATTERN_NUM_XL = Pattern.compile("^(\\d+)XL$");
    private static final Pattern PATTERN_XS = Pattern.compile("^(X{0,4})S$");
    private static final Pattern PATTERN_XL = Pattern.compile("^(X{1,4})L$");

    private ProductionOrderUtils() {
        // 工具类，禁止实例化
    }

    /**
     * 分割CSV字符串
     */
    public static List<String> splitCsv(String text) {
        if (!StringUtils.hasText(text)) {
            return Collections.emptyList();
        }
        List<String> result = new ArrayList<>();
        for (String s : text.split(",")) {
            String trimmed = s.trim();
            if (StringUtils.hasText(trimmed)) {
                result.add(trimmed);
            }
        }
        return result;
    }

    /**
     * 转换为整数
     */
    public static int toInt(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * 解析长整数
     */
    public static Long parseLong(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 安全获取文本
     */
    public static String safeText(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /**
     * 清理文件名
     */
    public static String sanitizeFilename(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "file";
        }
        String sanitized = filename.replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5.-]", "_");
        return StringUtils.hasText(sanitized) ? sanitized : "file";
    }

    /**
     * HTML转义
     */
    public static String escapeHtml(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#x27;");
    }

    /**
     * 从Map中获取第一个非空文本值
     */
    public static String pickFirstText(Map<String, Object> map, String... keys) {
        if (map == null || keys == null) {
            return "";
        }
        for (String key : keys) {
            Object value = map.get(key);
            if (value != null) {
                String text = String.valueOf(value).trim();
                if (StringUtils.hasText(text)) {
                    return text;
                }
            }
        }
        return "";
    }

    /**
     * 构建SKU编号
     */
    public static String buildSkuNo(String orderNo, String styleNo, String color, String size) {
        StringBuilder sb = new StringBuilder();
        if (StringUtils.hasText(orderNo)) {
            sb.append(orderNo.trim());
        }
        if (StringUtils.hasText(styleNo)) {
            if (sb.length() > 0) sb.append("-");
            sb.append(styleNo.trim());
        }
        if (StringUtils.hasText(color)) {
            if (sb.length() > 0) sb.append("-");
            sb.append(color.trim());
        }
        if (StringUtils.hasText(size)) {
            if (sb.length() > 0) sb.append("-");
            sb.append(size.trim());
        }
        return sb.toString();
    }

    /**
     * 解析订单明细
     */
    public static List<Map<String, Object>> resolveOrderLines(String orderDetails, ObjectMapper objectMapper) {
        if (!StringUtils.hasText(orderDetails)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(orderDetails, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("解析订单明细失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 尺码升序比较
     */
    public static int compareSizeAsc(String a, String b) {
        if (a == null && b == null) return 0;
        if (a == null) return -1;
        if (b == null) return 1;

        String ta = a.trim();
        String tb = b.trim();
        if (ta.equalsIgnoreCase(tb)) return 0;

        int ka = parseSizeKey(ta);
        int kb = parseSizeKey(tb);
        if (ka != kb) return Integer.compare(ka, kb);

        return ta.toLowerCase(Locale.ROOT).compareTo(tb.toLowerCase(Locale.ROOT));
    }

    /**
     * 解析尺码键值用于排序
     */
    private static int parseSizeKey(String size) {
        String s = size.trim().toUpperCase(Locale.ROOT);

        // 纯数字尺码 (如 28, 29, 30)
        if (PATTERN_NUMERIC_SIZE.matcher(s).matches()) {
            try {
                return Integer.parseInt(s) * 1000;
            } catch (NumberFormatException e) {
                return 0;
            }
        }

        // 数字+XL (如 2XL, 3XL)
        java.util.regex.Matcher m = PATTERN_NUM_XL.matcher(s);
        if (m.matches()) {
            int num = Integer.parseInt(m.group(1));
            return 500 + num * 10;
        }

        // XS系列 (如 XS, XXS, XXXS)
        m = PATTERN_XS.matcher(s);
        if (m.matches()) {
            int xCount = m.group(1).length();
            return 100 - xCount * 10;
        }

        // XL系列 (如 XL, XXL, XXXL)
        m = PATTERN_XL.matcher(s);
        if (m.matches()) {
            int xCount = m.group(1).length();
            return 400 + xCount * 10;
        }

        // 标准尺码映射
        return switch (s) {
            case "XXXS" -> 70;
            case "XXS" -> 80;
            case "XS" -> 100;
            case "S" -> 200;
            case "M" -> 300;
            case "L" -> 400;
            case "XL" -> 500;
            case "XXL" -> 510;
            case "XXXL" -> 520;
            case "XXXXL" -> 530;
            default -> 0;
        };
    }
}
