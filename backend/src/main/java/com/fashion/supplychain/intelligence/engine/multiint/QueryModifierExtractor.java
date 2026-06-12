package com.fashion.supplychain.intelligence.engine.multiint;

import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Lazy
public class QueryModifierExtractor {

    private static final Pattern TIME_RANGE_PATTERN = Pattern.compile(
        "(上个月|本月|本周|最近(\\d+)天|昨天|今天|明天|last_month|this_month|this_week|last_(\\d+)d|yesterday|today|tomorrow)"
    );

    private static final Pattern NEGATION_PATTERN = Pattern.compile("(除了|不包括|不要|排除|exclude|except|but|not)");

    private static final Pattern EXCLUDE_TARGET_PATTERN = Pattern.compile(
        "(?:除了|不包括|不要|排除)\\s*([\\u4e00-\\u9fa5\\w\\-]{1,8}?)(?=\\s*(?:的(?:订单|工单|款式|物料|工人|工资|工厂|出货)?|工厂|订单|工单|，|。|$))"
    );

    private static final Pattern COMPARISON_PATTERN = Pattern.compile(
        "(最[高低长短多少大小]|前(\\d+)|top\\s*(\\d+)|最大|最小|最高|最低)"
    );

    private static final Pattern ORDER_LEVEL_PATTERN = Pattern.compile("(订单|工单|款式|物料|工厂|工人|工资|扫码|质检|出货)");

    public Map<String, Object> extract(String query) {
        Map<String, Object> result = new HashMap<>();
        result.put("timeRange", extractTimeRange(query));
        result.put("exclude", extractExcludes(query));
        Map<String, Object> cmp = extractComparison(query);
        result.putAll(cmp);
        result.put("comparison", cmp);
        result.put("orderLevel", extractOrderLevel(query));
        return result;
    }

    public String extractTimeRange(String query) {
        if (query == null) return null;
        Matcher m = TIME_RANGE_PATTERN.matcher(query);
        if (!m.find()) return null;
        String match = m.group(1);
        if (match.contains("上个月") || match.equals("last_month")) return "last_month";
        if (match.contains("本月") || match.equals("this_month")) return "this_month";
        if (match.contains("本周") || match.equals("this_week")) return "this_week";
        if (match.contains("昨天") || match.equals("yesterday")) return "yesterday";
        if (match.contains("今天") || match.equals("today")) return "today";
        if (match.contains("明天") || match.equals("tomorrow")) return "tomorrow";
        if (match.contains("最近") && match.contains("天")) return "last_" + m.group(2) + "d";
        return null;
    }

    public List<String> extractExcludes(String query) {
        if (query == null) return List.of();
        if (!NEGATION_PATTERN.matcher(query).find()) return List.of();
        Matcher target = EXCLUDE_TARGET_PATTERN.matcher(query);
        return target.find() ? List.of(target.group(1)) : List.of();
    }

    public Map<String, Object> extractComparison(String query) {
        Map<String, Object> result = new HashMap<>();
        if (query == null) return result;
        Matcher m = COMPARISON_PATTERN.matcher(query);
        if (m.find()) {
            String match = m.group(0);
            if (match.startsWith("前") || match.startsWith("top")) {
                String digits = m.group(2) != null ? m.group(2) : m.group(3);
                if (digits != null) result.put("topN", Integer.parseInt(digits));
            } else {
                result.put("extreme", match);
            }
        }
        return result;
    }

    public List<String> extractOrderLevel(String query) {
        if (query == null) return List.of();
        Matcher m = ORDER_LEVEL_PATTERN.matcher(query);
        Set<String> found = new LinkedHashSet<>();
        while (m.find()) found.add(m.group(1));
        return new ArrayList<>(found);
    }
}
