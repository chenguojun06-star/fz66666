package com.fashion.supplychain.common.util;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 科学时间计算工具
 * 扣除非工作时间（夜间22:00-08:00、周末），只计算有效工作时间
 *
 * 工作时间定义：
 * - 周一至周五：08:00 - 22:00（14小时/天）
 * - 周六：08:00 - 17:00（9小时/天）
 * - 周日：非工作日
 * - 法定节假日暂不处理（需要节假日表，后续可扩展）
 */
public final class WorkingTimeCalculator {

    private WorkingTimeCalculator() {}

    /** 每日工作开始时间 */
    private static final LocalTime WORK_START = LocalTime.of(8, 0);
    /** 工作日工作结束时间 */
    private static final LocalTime WORK_END_WEEKDAY = LocalTime.of(22, 0);
    /** 周六工作结束时间 */
    private static final LocalTime WORK_END_SATURDAY = LocalTime.of(17, 0);

    /** 工作日每日工作秒数：14小时 */
    private static final long WEEKDAY_WORK_SECONDS = 14 * 3600L;
    /** 周六每日工作秒数：9小时 */
    private static final long SATURDAY_WORK_SECONDS = 9 * 3600L;

    /**
     * 计算两个时间点之间的有效工作秒数
     * 扣除夜间休息时间和周日
     */
    public static long calculateWorkingSeconds(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || !end.isAfter(start)) {
            return 0;
        }

        long totalSeconds = 0;
        LocalDateTime cursor = start;

        while (cursor.isBefore(end)) {
            LocalDateTime dayEnd = cursor.toLocalDate().atTime(getWorkEnd(cursor));
            LocalDateTime segmentEnd = dayEnd.isBefore(end) ? dayEnd : end;

            // 当天的工作开始时间
            LocalDateTime dayStart = cursor.toLocalDate().atTime(WORK_START);

            // 如果cursor在工作开始时间之前，跳到工作开始时间
            if (cursor.isBefore(dayStart)) {
                cursor = dayStart;
                if (!cursor.isBefore(end)) break;
                segmentEnd = dayEnd.isBefore(end) ? dayEnd : end;
            }

            if (isWorkDay(cursor)) {
                if (segmentEnd.isAfter(cursor)) {
                    totalSeconds += Duration.between(cursor, segmentEnd).getSeconds();
                }
            }

            // 移到下一天的工作开始时间
            cursor = cursor.toLocalDate().plusDays(1).atTime(WORK_START);
        }

        return totalSeconds;
    }

    /**
     * 将工作秒数格式化为人类可读字符串
     * 如 "3天5小时"、"8小时"、"30分钟"
     */
    public static String formatWorkingDuration(long workingSeconds) {
        if (workingSeconds <= 0) return "-";

        // 用工作日天数（14小时/天）来换算
        long workDays = workingSeconds / WEEKDAY_WORK_SECONDS;
        long remainingSeconds = workingSeconds % WEEKDAY_WORK_SECONDS;
        long workHours = remainingSeconds / 3600;
        long workMinutes = (remainingSeconds % 3600) / 60;

        StringBuilder sb = new StringBuilder();
        if (workDays > 0) {
            sb.append(workDays).append("天");
        }
        if (workHours > 0) {
            sb.append(workHours).append("小时");
        }
        if (workDays == 0 && workMinutes > 0) {
            sb.append(workMinutes).append("分钟");
        }
        if (sb.length() == 0) {
            sb.append("<1分钟");
        }
        return sb.toString();
    }

    /**
     * 将预算小时数格式化为显示文本
     * 如 24小时 → "3天"、8小时 → "8小时"、4小时 → "4小时"
     */
    public static String formatBudgetHours(Integer budgetHours) {
        if (budgetHours == null || budgetHours <= 0) return "";
        if (budgetHours >= 14) {
            long days = budgetHours / 14;
            long hours = budgetHours % 14;
            if (hours == 0) return days + "天";
            return days + "天" + hours + "小时";
        }
        return budgetHours + "小时";
    }

    /**
     * 计算环节实际耗时（科学计算，扣除非工作时间）
     * @return 格式化的耗时字符串，如 "2天5小时"
     */
    public static String calculateActualDuration(LocalDateTime startTime, LocalDateTime completedTime) {
        if (startTime == null || completedTime == null) return "-";
        long workingSeconds = calculateWorkingSeconds(startTime, completedTime);
        return formatWorkingDuration(workingSeconds);
    }

    /**
     * 计算等待时间（上一环节完成 → 当前环节开始，扣除非工作时间）
     * @return 格式化的等待时间字符串，如 "1天3小时"
     */
    public static String calculateWaitingDuration(LocalDateTime prevEndTime, LocalDateTime currentStartTime) {
        if (prevEndTime == null || currentStartTime == null) return null;
        long workingSeconds = calculateWorkingSeconds(prevEndTime, currentStartTime);
        if (workingSeconds <= 0) return null;
        return formatWorkingDuration(workingSeconds);
    }

    /**
     * 计算预算超时/剩余状态
     * @return 状态文本，如 "准时"、"超2天"、"剩3天"
     */
    public static String computeBudgetStatus(Integer budgetHours, LocalDateTime startTime, LocalDateTime completedTime) {
        if (budgetHours == null || budgetHours <= 0) return "";
        long budgetSeconds = (long) budgetHours * 3600;

        if (completedTime != null && startTime != null) {
            long actualSeconds = calculateWorkingSeconds(startTime, completedTime);
            if (actualSeconds <= budgetSeconds) return "准时";
            long overSeconds = actualSeconds - budgetSeconds;
            return "超" + formatWorkingDuration(overSeconds);
        }

        if (startTime != null) {
            long elapsedSeconds = calculateWorkingSeconds(startTime, LocalDateTime.now());
            long remainingSeconds = budgetSeconds - elapsedSeconds;
            if (remainingSeconds > 0) return "剩" + formatWorkingDuration(remainingSeconds);
            if (remainingSeconds > -3600) return "即将超时";
            return "超" + formatWorkingDuration(-remainingSeconds);
        }

        return "";
    }

    private static boolean isWorkDay(LocalDateTime dateTime) {
        DayOfWeek dow = dateTime.getDayOfWeek();
        return dow != DayOfWeek.SUNDAY;
    }

    private static LocalTime getWorkEnd(LocalDateTime dateTime) {
        DayOfWeek dow = dateTime.getDayOfWeek();
        if (dow == DayOfWeek.SATURDAY) return WORK_END_SATURDAY;
        if (dow == DayOfWeek.SUNDAY) return WORK_START; // 周日不工作
        return WORK_END_WEEKDAY;
    }
}
