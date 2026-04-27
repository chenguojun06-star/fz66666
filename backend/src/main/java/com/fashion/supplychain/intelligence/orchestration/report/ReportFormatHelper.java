package com.fashion.supplychain.intelligence.orchestration.report;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

public class ReportFormatHelper {

    public static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    public static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public record TimeRange(LocalDateTime start, LocalDateTime end,
                            LocalDateTime prevStart, LocalDateTime prevEnd, String label) {
    }

    public record FactoryRank(String name, long scanCount, long scanQty) {
    }

    public static TimeRange calcTimeRange(String reportType, LocalDate baseDate) {
        LocalDateTime start, end, prevStart, prevEnd;
        String label;
        switch (reportType) {
            case "weekly":
                LocalDate monday = baseDate.minusDays(baseDate.getDayOfWeek().getValue() - 1);
                start = LocalDateTime.of(monday, LocalTime.MIN);
                end = LocalDateTime.of(monday.plusDays(6), LocalTime.MAX);
                prevStart = start.minusWeeks(1);
                prevEnd = end.minusWeeks(1);
                label = monday.format(DATE_FMT) + " ~ " + monday.plusDays(6).format(DATE_FMT);
                break;
            case "monthly":
                LocalDate first = baseDate.withDayOfMonth(1);
                start = LocalDateTime.of(first, LocalTime.MIN);
                end = LocalDateTime.of(first.plusMonths(1).minusDays(1), LocalTime.MAX);
                prevStart = start.minusMonths(1);
                prevEnd = end.minusMonths(1);
                label = first.format(DATE_FMT) + " ~ " + first.plusMonths(1).minusDays(1).format(DATE_FMT);
                break;
            default:
                start = LocalDateTime.of(baseDate, LocalTime.MIN);
                end = LocalDateTime.of(baseDate, LocalTime.MAX);
                prevStart = start.minusDays(1);
                prevEnd = end.minusDays(1);
                label = baseDate.format(DATE_FMT);
        }
        return new TimeRange(start, end, prevStart, prevEnd, label);
    }

    public static String changeStr(long cur, long prev) {
        if (prev == 0) return cur > 0 ? "+∞" : "持平";
        double pct = ((double) (cur - prev) / prev) * 100;
        return (pct >= 0 ? "+" : "") + String.format("%.1f%%", pct);
    }

    public static String nullSafe(String s) {
        return s != null ? s : "";
    }

    public static Map<String, Object> buildKpi(String name, long current, long previous, String unit) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("current", current);
        m.put("previous", previous);
        m.put("change", previous >= 0 ? changeStr(current, previous) : "-");
        m.put("unit", unit);
        return m;
    }

    public static Map<String, Object> orderToMap(Object order, String orderNo, String styleNo,
                                                  String status, String factoryName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("orderNo", nullSafe(orderNo));
        m.put("styleNo", nullSafe(styleNo));
        m.put("status", nullSafe(status));
        m.put("factoryName", nullSafe(factoryName));
        return m;
    }
}
