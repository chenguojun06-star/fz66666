package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Pattern;

/**
 * 工具参数自动修复服务 — 提升工具调用成功率。
 *
 * <h3>设计原则（安全优先）：</h3>
 * <ul>
 *   <li>只修复安全可逆的格式错误，不修复业务逻辑错误</li>
 *   <li>修复后记录日志，便于追踪</li>
 *   <li>修复失败返回原始参数，由 validateArguments 报错</li>
 *   <li>可配置开关（xiaoyun.tool-autofix.enabled），随时可关闭</li>
 * </ul>
 *
 * <h3>修复规则：</h3>
 * <ul>
 *   <li>日期格式：20260101 → 2026-01-01，2026/01/01 → 2026-01-01</li>
 *   <li>ID格式：字符串 "123" → 数字 123（如果目标类型是 integer）</li>
 *   <li>字段名：snake_case → camelCase（如 order_id → orderId）</li>
 *   <li>空值处理：空字符串 → null（避免 "" 导致查询失败）</li>
 * </ul>
 *
 * <p>参考 GitHub 2026 最佳实践：LangChain Tool Validation + OpenAI Function Calling Best Practices。
 */
@Slf4j
@Service
@Lazy
public class ToolParameterAutoFixService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // 日期格式正则
    private static final Pattern DATE_NO_SEP = Pattern.compile("^\\d{8}$"); // 20260101
    private static final Pattern DATE_SLASH_SEP = Pattern.compile("^\\d{4}/\\d{1,2}/\\d{1,2}$"); // 2026/01/01
    private static final Pattern DATE_DASH_SEP = Pattern.compile("^\\d{4}-\\d{1,2}-\\d{1,2}$"); // 2026-01-01

    // 常见字段名映射（snake_case → camelCase）
    private static final Map<String, String> FIELD_NAME_FIXES = Map.ofEntries(
            Map.entry("order_id", "orderId"),
            Map.entry("order_no", "orderNo"),
            Map.entry("tenant_id", "tenantId"),
            Map.entry("user_id", "userId"),
            Map.entry("factory_id", "factoryId"),
            Map.entry("style_id", "styleId"),
            Map.entry("style_no", "styleNo"),
            Map.entry("material_id", "materialId"),
            Map.entry("material_code", "materialCode"),
            Map.entry("production_id", "productionId"),
            Map.entry("scan_id", "scanId"),
            Map.entry("batch_no", "batchNo"),
            Map.entry("start_date", "startDate"),
            Map.entry("end_date", "endDate"),
            Map.entry("create_time", "createTime"),
            Map.entry("update_time", "updateTime"),
            Map.entry("department_id", "departmentId"),
            Map.entry("team_id", "teamId"),
            Map.entry("worker_id", "workerId"),
            // 服装行业专用字段（新增）
            Map.entry("skc_code", "skc"),
            Map.entry("sku_code", "skuCode"),
            Map.entry("color_name", "colorName"),
            Map.entry("size_name", "sizeName"),
            Map.entry("process_id", "processId"),
            Map.entry("process_name", "processName"),
            Map.entry("unit_price", "unitPrice"),
            Map.entry("process_unit_price", "processUnitPrice"),
            Map.entry("payroll_id", "payrollId"),
            Map.entry("defect_id", "defectId"),
            Map.entry("shipment_id", "shipmentId"),
            Map.entry("bom_id", "bomId"),
            Map.entry("pattern_id", "patternId"),
            Map.entry("attachment_id", "attachmentId"),
            Map.entry("customer_id", "customerId"),
            Map.entry("customer_name", "customerName")
    );

    @Value("${xiaoyun.tool-autofix.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.tool-autofix.log-level:debug}")
    private String logLevel;

    /**
     * 自动修复工具参数。
     *
     * @param toolName 工具名称（用于日志）
     * @param args 原始参数
     * @param expectedProperties 工具定义的参数 schema（用于类型推断）
     * @return 修复后的参数（或原始参数，如果不可修复）
     */
    public Map<String, Object> autoFix(String toolName, Map<String, Object> args,
                                        Map<String, Object> expectedProperties) {
        if (!enabled || args == null || args.isEmpty()) {
            return args;
        }

        Map<String, Object> fixed = new LinkedHashMap<>(args);
        List<String> fixLogs = new ArrayList<>();

        for (Map.Entry<String, Object> entry : args.entrySet()) {
            String key = entry.getKey();
            Object val = entry.getValue();

            // 1. 字段名修复
            String fixedKey = fixFieldName(key);
            if (!fixedKey.equals(key)) {
                fixed.remove(key);
                fixed.put(fixedKey, val);
                fixLogs.add("字段名: " + key + " → " + fixedKey);
                key = fixedKey; // 后续处理使用新 key
            }

            // 2. 空值处理
            if (val instanceof String s && s.isBlank()) {
                fixed.put(key, null);
                fixLogs.add("空字符串 → null: " + key);
                continue;
            }

            // 3. 类型修复（根据 schema）
            if (expectedProperties != null && expectedProperties.get(key) instanceof Map propDef) {
                Object fixedVal = fixValue(val, propDef, key);
                if (fixedVal != val) {
                    fixed.put(key, fixedVal);
                    fixLogs.add("值修复: " + key + " [" + val.getClass().getSimpleName() + " → " + fixedVal.getClass().getSimpleName() + "]");
                }
            }

            // 4. 日期格式修复（常见场景）
            if (val instanceof String s && isLikelyDate(key)) {
                String fixedDate = fixDateFormat(s);
                if (fixedDate != null && !fixedDate.equals(s)) {
                    fixed.put(key, fixedDate);
                    fixLogs.add("日期格式: " + s + " → " + fixedDate);
                }
            }
        }

        // 记录修复日志
        if (!fixLogs.isEmpty()) {
            if ("info".equalsIgnoreCase(logLevel)) {
                log.info("[AutoFix] {} 参数修复: {}", toolName, String.join(", ", fixLogs));
            } else {
                log.debug("[AutoFix] {} 参数修复: {}", toolName, String.join(", ", fixLogs));
            }
        }

        return fixed;
    }

    /**
     * 修复字段名（snake_case → camelCase）。
     */
    private String fixFieldName(String key) {
        // 直接查映射表
        String mapped = FIELD_NAME_FIXES.get(key);
        if (mapped != null) {
            return mapped;
        }
        // 动态转换：包含下划线的尝试转 camelCase
        if (key.contains("_")) {
            StringBuilder sb = new StringBuilder();
            boolean nextUpper = false;
            for (char c : key.toCharArray()) {
                if (c == '_') {
                    nextUpper = true;
                } else {
                    sb.append(nextUpper ? Character.toUpperCase(c) : c);
                    nextUpper = false;
                }
            }
            return sb.toString();
        }
        return key;
    }

    /**
     * 修复值类型（根据 schema）。
     */
    private Object fixValue(Object val, Map<String, Object> propDef, String key) {
        if (val == null) return null;

        Object typeObj = propDef.get("type");
        if (typeObj == null) return val;

        String expectedType = typeObj.toString();

        try {
            switch (expectedType) {
                case "integer":
                    if (val instanceof String s) {
                        // 字符串转整数
                        return Long.parseLong(s.trim());
                    } else if (val instanceof Number n) {
                        return n.longValue();
                    }
                    break;
                case "number":
                    if (val instanceof String s) {
                        return Double.parseDouble(s.trim());
                    } else if (val instanceof Number n) {
                        return n.doubleValue();
                    }
                    break;
                case "boolean":
                    if (val instanceof String s) {
                        String lower = s.toLowerCase().trim();
                        if ("true".equals(lower) || "1".equals(lower) || "yes".equals(lower)) {
                            return true;
                        }
                        if ("false".equals(lower) || "0".equals(lower) || "no".equals(lower)) {
                            return false;
                        }
                    }
                    break;
                case "string":
                    // 数字转字符串（LLM 有时会把订单号当数字）
                    if (val instanceof Number n) {
                        return String.valueOf(n.longValue());
                    }
                    break;
                // array/object 不自动修复（太复杂）
            }
        } catch (NumberFormatException e) {
            log.debug("[AutoFix] 类型转换失败: key={}, val={}, expected={}", key, val, expectedType);
        }

        return val;
    }

    /**
     * 修复日期格式。
     * 支持：20260101、2026/01/01、2026-01-01、中文日期、相对日期（今天/昨天/上周）
     */
    private String fixDateFormat(String val) {
        if (val == null || val.isBlank()) return null;
        String trimmed = val.trim();

        try {
            // 20260101 → 2026-01-01
            if (DATE_NO_SEP.matcher(trimmed).matches()) {
                String fixed = trimmed.substring(0, 4) + "-" + trimmed.substring(4, 6) + "-" + trimmed.substring(6, 8);
                LocalDate.parse(fixed);
                return fixed;
            }
            // 2026/01/01 → 2026-01-01
            if (DATE_SLASH_SEP.matcher(trimmed).matches()) {
                String fixed = trimmed.replace("/", "-");
                LocalDate.parse(fixed);
                return fixed;
            }
            // 已经是标准格式，验证有效性
            if (DATE_DASH_SEP.matcher(trimmed).matches()) {
                LocalDate.parse(trimmed);
                return trimmed;
            }
            // 中文日期解析（新增）
            String chineseDate = parseChineseDate(trimmed);
            if (chineseDate != null) return chineseDate;
        } catch (DateTimeParseException e) {
            log.debug("[AutoFix] 日期格式无效: {}", val);
        }

        return null;
    }

    /**
     * 解析中文日期和相对日期。
     * 支持：今天/昨天/明天/前天/后天/上周/本周/上月/本月/N天前/N天后
     */
    private String parseChineseDate(String val) {
        if (val == null) return null;
        String lower = val.toLowerCase().trim();
        LocalDate today = LocalDate.now();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        // 相对日期
        if (lower.contains("今天") || lower.equals("today")) return today.format(fmt);
        if (lower.contains("昨天") || lower.equals("yesterday")) return today.minusDays(1).format(fmt);
        if (lower.contains("明天") || lower.equals("tomorrow")) return today.plusDays(1).format(fmt);
        if (lower.contains("前天")) return today.minusDays(2).format(fmt);
        if (lower.contains("后天")) return today.plusDays(2).format(fmt);
        if (lower.contains("上周")) return today.minusWeeks(1).format(fmt);
        if (lower.contains("下周")) return today.plusWeeks(1).format(fmt);
        if (lower.contains("本月") || lower.equals("this month")) return today.withDayOfMonth(1).format(fmt);
        if (lower.contains("上月")) return today.minusMonths(1).withDayOfMonth(1).format(fmt);
        if (lower.contains("下月")) return today.plusMonths(1).withDayOfMonth(1).format(fmt);

        // N天前/N天后
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+)\\s*天前").matcher(val);
        if (m.find()) {
            int days = Integer.parseInt(m.group(1));
            return today.minusDays(days).format(fmt);
        }
        m = java.util.regex.Pattern.compile("(\\d+)\\s*天后").matcher(val);
        if (m.find()) {
            int days = Integer.parseInt(m.group(1));
            return today.plusDays(days).format(fmt);
        }

        // 中文日期：2026年1月1日 / 1月1日
        m = java.util.regex.Pattern.compile("(\\d{4})年(\\d{1,2})月(\\d{1,2})日").matcher(val);
        if (m.find()) {
            return String.format("%s-%02d-%02d", m.group(1),
                    Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
        }
        m = java.util.regex.Pattern.compile("(\\d{1,2})月(\\d{1,2})日").matcher(val);
        if (m.find()) {
            return String.format("%d-%02d-%02d", today.getYear(),
                    Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
        }

        return null;
    }

    /**
     * 判断 key 是否可能是日期字段。
     */
    private boolean isLikelyDate(String key) {
        String lower = key.toLowerCase();
        return lower.contains("date") ||
               lower.endsWith("_at") ||
               lower.endsWith("_time") ||
               lower.equals("start") ||
               lower.equals("end") ||
               lower.equals("from") ||
               lower.equals("to") ||
               lower.equals("created") ||
               lower.equals("updated") ||
               lower.equals("deadline") ||
               lower.equals("delivery");
    }

    /**
     * 获取修复统计（用于监控）。
     */
    public FixStats getStats() {
        return new FixStats(enabled);
    }

    public static class FixStats {
        public final boolean enabled;

        public FixStats(boolean enabled) {
            this.enabled = enabled;
        }
    }
}