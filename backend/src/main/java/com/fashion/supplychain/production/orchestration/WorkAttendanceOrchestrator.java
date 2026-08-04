package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 员工打卡编排器（事务边界，符合 D-001）
 * <p>
 * 业务规则：
 * 1. 上班打卡：今日无记录则创建；已有记录但 clock_in_time 为空则补齐；已存在则返回提示
 *    并发兜底：两个并发 clockIn 都看到 today==null 时，唯一键 uk_tenant_user_date
 *    会让其中一个抛 DuplicateKeyException，捕获后重新查询返回当前状态（不报 500）
 * 2. 下班打卡：
 *    a) 今日有记录：更新 clock_out_time 并重算 work_minutes
 *    b) 今日无记录但存在「未下班打卡」记录（跨天补卡）：补下班时间到最近一条上班卡
 *    c) 完全无记录：按当前时间补一条上下班都打卡的记录
 * 3. 工时计算：work_minutes = MAX(0, MIN(clock_out - clock_in, 1440))
 *    封顶 24 小时（1440 分钟），避免异常数据
 * 4. 不做打卡限制：员工可随意上下班打卡，覆盖更新 clock_out_time
 */
@Slf4j
@Service
public class WorkAttendanceOrchestrator {

    @Autowired
    private WorkAttendanceService workAttendanceService;

    /**
     * 上班打卡
     */
    @Transactional
    public Map<String, Object> clockIn() {
        UserContext ctx = requireUserContext();
        Long tenantId = ctx.tenantId();
        String userId = ctx.getUserId();
        String userName = ctx.getUsername();
        String factoryId = ctx.factoryId();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        WorkAttendance today_record = workAttendanceService.findToday(tenantId, userId, today);
        if (today_record != null && today_record.getClockInTime() != null) {
            // 已上班打过卡，返回当前状态
            Map<String, Object> resp = buildStatusResp(today_record, "今日已上班打卡");
            return resp;
        }

        if (today_record == null) {
            today_record = new WorkAttendance();
            today_record.setTenantId(tenantId);
            today_record.setUserId(userId);
            today_record.setUserName(userName);
            today_record.setFactoryId(factoryId);
            today_record.setWorkDate(today);
            today_record.setClockInTime(now);
            today_record.setSource("manual");
            today_record.setDeleteFlag(0);
            today_record.setWorkMinutes(0);
            try {
                workAttendanceService.save(today_record);
            } catch (DuplicateKeyException dke) {
                // 并发兜底：两个并发 clockIn 都走到 save，唯一键 uk_tenant_user_date 让其中一个失败
                // 捕获后重新查询返回当前状态，避免向用户报 500
                WorkAttendance existing = workAttendanceService.findToday(tenantId, userId, today);
                if (existing != null && existing.getClockInTime() != null) {
                    log.warn("[clockIn] 并发兜底命中：tenantId={} userId={} clockInTime={}",
                            tenantId, userId, existing.getClockInTime());
                    return buildStatusResp(existing, "今日已上班打卡");
                }
                throw dke;
            }
        } else {
            today_record.setClockInTime(now);
            today_record.setUserName(userName);
            today_record.setFactoryId(factoryId);
            workAttendanceService.updateById(today_record);
        }

        log.info("[clockIn] tenantId={} userId={} clockInTime={}", tenantId, userId, now);
        return buildStatusResp(today_record, "上班打卡成功");
    }

    /**
     * 下班打卡
     */
    @Transactional
    public Map<String, Object> clockOut() {
        UserContext ctx = requireUserContext();
        Long tenantId = ctx.tenantId();
        String userId = ctx.getUserId();
        String userName = ctx.getUsername();
        String factoryId = ctx.factoryId();
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();

        WorkAttendance today_record = workAttendanceService.findToday(tenantId, userId, today);

        // 跨天补卡兜底：今日无记录时，查最近一条「未下班打卡」记录（可能是昨晚的上班卡）
        // 场景：用户 day1 23:55 上班打卡，day2 00:30 下班打卡
        // 今日（day2）查不到记录，但 day1 的上班卡未补下班时间 —— 此时补 clock_out_time 到 day1 的记录
        if (today_record == null) {
            WorkAttendance open_record = workAttendanceService.findLatestOpen(tenantId, userId);
            if (open_record != null) {
                open_record.setClockOutTime(now);
                open_record.setWorkMinutes(computeWorkMinutes(open_record.getClockInTime(), now));
                open_record.setUserName(userName);
                open_record.setFactoryId(factoryId);
                workAttendanceService.updateById(open_record);
                log.info("[clockOut] 跨天补下班卡 tenantId={} userId={} clockInTime={} clockOutTime={} workMinutes={}",
                        tenantId, userId, open_record.getClockInTime(), now, open_record.getWorkMinutes());
                return buildStatusResp(open_record, "下班打卡成功（跨天补卡）");
            }

            // 完全没有上班卡：按当前时间补一条上下班都打卡的记录（保留原补卡兜底）
            today_record = new WorkAttendance();
            today_record.setTenantId(tenantId);
            today_record.setUserId(userId);
            today_record.setUserName(userName);
            today_record.setFactoryId(factoryId);
            today_record.setWorkDate(today);
            today_record.setClockInTime(now);
            today_record.setClockOutTime(now);
            today_record.setSource("manual");
            today_record.setDeleteFlag(0);
            today_record.setWorkMinutes(0);
            workAttendanceService.save(today_record);
            log.info("[clockOut] tenantId={} userId={} 补打上下班卡 clockInTime=clockOutTime={}",
                    tenantId, userId, now);
            return buildStatusResp(today_record, "已补打上下班卡（漏打上班卡）");
        }

        // 已有上班打卡记录，更新下班时间 + 重算工时
        today_record.setClockOutTime(now);
        today_record.setWorkMinutes(computeWorkMinutes(today_record.getClockInTime(), now));
        today_record.setUserName(userName);
        today_record.setFactoryId(factoryId);
        workAttendanceService.updateById(today_record);
        log.info("[clockOut] tenantId={} userId={} clockOutTime={} workMinutes={}",
                tenantId, userId, now, today_record.getWorkMinutes());

        return buildStatusResp(today_record, "下班打卡成功");
    }

    /**
     * 今日打卡状态
     */
    public Map<String, Object> todayStatus() {
        UserContext ctx = requireUserContext();
        WorkAttendance today = workAttendanceService.findToday(ctx.tenantId(), ctx.getUserId(), LocalDate.now());
        String message;
        if (today == null) {
            message = "今日未打卡";
        } else if (today.getClockInTime() == null) {
            message = "今日未上班打卡";
        } else if (today.getClockOutTime() == null) {
            message = "上班中";
        } else {
            message = "今日已下班";
        }
        return buildStatusResp(today, message);
    }

    /**
     * 本月工时统计
     * 返回：{ workHours, workDays, monthMinutes, message }
     */
    public Map<String, Object> monthlyStats() {
        UserContext ctx = requireUserContext();
        Map<String, Object> agg = workAttendanceService.monthlyStats(
                ctx.tenantId(), ctx.getUserId(), LocalDate.now());
        Map<String, Object> resp = new LinkedHashMap<>();
        Object hours = agg == null ? null : agg.get("workHours");
        Object days = agg == null ? null : agg.get("workDays");
        Object minutes = agg == null ? null : agg.get("monthMinutes");
        resp.put("workHours", hours != null ? hours : 0);
        resp.put("workDays", days != null ? days : 0);
        resp.put("monthMinutes", minutes != null ? minutes : 0);
        return resp;
    }

    /**
     * 月度打卡明细（手机端考勤详情页）
     * <p>
     * 返回结构：
     * {
     *   month: "2026-08",
     *   summary: { workHours, workDays, monthMinutes, avgHoursPerDay, absentDays },
     *   records: [
     *     {
     *       workDate, clockInTime, clockOutTime, workMinutes, workHours,
     *       status: NORMAL/LATE/EARLY_LEAVE/MISSING_CLOCK_OUT/ABNORMAL,
     *       statusText, dayOfWeek, isToday, isWeekend, isFuture
     *     }
     *   ],
     *   calendar: [
     *     { date, day, hasRecord, status, isToday, isWeekend, isFuture, isCurrentMonth }
     *   ]
     * }
     * <p>
     * 异常判定规则：
     * - LATE：clockInTime 在 09:00 之后（上班打卡时间晚于规定时间）
     * - EARLY_LEAVE：clockOutTime 在 18:00 之前（下班打卡时间早于规定时间）
     * - MISSING_CLOCK_OUT：clockOutTime 为空但 clockInTime 不空（漏打下班卡）
     * - ABNORMAL：workMinutes < 60 或 > 960（少于1小时或超过16小时，数据异常）
     * - NORMAL：其他正常情况
     */
    public Map<String, Object> monthlyRecords(String monthStr) {
        UserContext ctx = requireUserContext();
        Long tenantId = ctx.tenantId();
        String userId = ctx.getUserId();

        LocalDate monthDate = parseMonth(monthStr);
        // 默认当月
        if (monthDate == null) monthDate = LocalDate.now();

        List<WorkAttendance> records = workAttendanceService.listMonthlyRecords(tenantId, userId, monthDate);
        Map<String, Object> stats = workAttendanceService.monthlyStats(tenantId, userId, monthDate);

        YearMonth ym = YearMonth.from(monthDate);
        LocalDate today = LocalDate.now();
        LocalDate monthStart = ym.atDay(1);
        LocalDate monthEnd = ym.atEndOfMonth();

        // 标准上下班时间（用于异常判定）
        LocalTime standardClockIn = LocalTime.of(9, 0);
        LocalTime standardClockOut = LocalTime.of(18, 0);

        // 明细列表
        List<Map<String, Object>> recordList = new ArrayList<>();
        for (WorkAttendance r : records) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("workDate", r.getWorkDate() != null ? r.getWorkDate().toString() : null);
            item.put("clockInTime", formatDateTime(r.getClockInTime()));
            item.put("clockOutTime", formatDateTime(r.getClockOutTime()));
            item.put("workMinutes", r.getWorkMinutes() != null ? r.getWorkMinutes() : 0);
            item.put("workHours", formatHours(r.getWorkMinutes()));
            item.put("dayOfWeek", r.getWorkDate() != null ? getDayOfWeekChinese(r.getWorkDate()) : "");
            item.put("isToday", r.getWorkDate() != null && r.getWorkDate().equals(today));
            item.put("isWeekend", r.getWorkDate() != null && isWeekend(r.getWorkDate()));
            item.put("isFuture", r.getWorkDate() != null && r.getWorkDate().isAfter(today));
            item.put("remark", r.getRemark());

            // 异常状态判定
            String[] statusInfo = detectStatus(r, standardClockIn, standardClockOut);
            item.put("status", statusInfo[0]);
            item.put("statusText", statusInfo[1]);
            recordList.add(item);
        }

        // 日历视图（包含整月每一天，用于前端渲染"哪天打了/没打"）
        List<Map<String, Object>> calendar = new ArrayList<>();
        for (LocalDate d = monthStart; !d.isAfter(monthEnd); d = d.plusDays(1)) {
            WorkAttendance match = findRecordByDate(records, d);
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", d.toString());
            day.put("day", d.getDayOfMonth());
            day.put("hasRecord", match != null);
            day.put("isToday", d.equals(today));
            day.put("isWeekend", isWeekend(d));
            day.put("isFuture", d.isAfter(today));
            day.put("isCurrentMonth", true);
            if (match != null) {
                String[] statusInfo = detectStatus(match, standardClockIn, standardClockOut);
                day.put("status", statusInfo[0]);
                day.put("workMinutes", match.getWorkMinutes() != null ? match.getWorkMinutes() : 0);
            } else {
                day.put("status", d.isAfter(today) ? "FUTURE" : "NO_RECORD");
                day.put("workMinutes", 0);
            }
            calendar.add(day);
        }

        // 汇总
        Map<String, Object> summary = new LinkedHashMap<>();
        Object hours = stats == null ? null : stats.get("workHours");
        Object days = stats == null ? null : stats.get("workDays");
        Object minutes = stats == null ? null : stats.get("monthMinutes");
        double workHours = toDouble(hours);
        int workDays = toInt(days);
        long monthMinutes = toLong(minutes);
        // 应出勤天数：当月已过去的非周末天数（不含未来）
        int expectedDays = countWorkdayUntil(monthStart, today.minusDays(0).isBefore(monthStart) ? monthEnd : today);
        int absentDays = Math.max(0, expectedDays - workDays);
        double avgHours = workDays > 0 ? Math.round(workHours / workDays * 10.0) / 10.0 : 0.0;
        summary.put("workHours", workHours);
        summary.put("workDays", workDays);
        summary.put("monthMinutes", monthMinutes);
        summary.put("avgHoursPerDay", avgHours);
        summary.put("expectedDays", expectedDays);
        summary.put("absentDays", absentDays);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("month", ym.toString());
        resp.put("summary", summary);
        resp.put("records", recordList);
        resp.put("calendar", calendar);
        return resp;
    }

    // ==================== 私有方法 ====================

    private LocalDate parseMonth(String monthStr) {
        if (!StringUtils.hasText(monthStr)) return null;
        try {
            return LocalDate.parse(monthStr + "-01", DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            try {
                return LocalDate.parse(monthStr, DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception ex) {
                return null;
            }
        }
    }

    private String formatDateTime(LocalDateTime dt) {
        if (dt == null) return null;
        return dt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private String formatHours(Integer minutes) {
        if (minutes == null || minutes <= 0) return "0.0";
        return String.format("%.1f", minutes / 60.0);
    }

    private double toDouble(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return 0.0; }
    }

    private int toInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).intValue();
        try { return Integer.parseInt(String.valueOf(o)); } catch (Exception e) { return 0; }
    }

    private long toLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number) return ((Number) o).longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return 0L; }
    }

    private String getDayOfWeekChinese(LocalDate date) {
        switch (date.getDayOfWeek()) {
            case MONDAY: return "周一";
            case TUESDAY: return "周二";
            case WEDNESDAY: return "周三";
            case THURSDAY: return "周四";
            case FRIDAY: return "周五";
            case SATURDAY: return "周六";
            case SUNDAY: return "周日";
            default: return "";
        }
    }

    private boolean isWeekend(LocalDate date) {
        java.time.DayOfWeek dow = date.getDayOfWeek();
        return dow == java.time.DayOfWeek.SATURDAY || dow == java.time.DayOfWeek.SUNDAY;
    }

    /**
     * 统计从 monthStart 到 endDate（含）之间的工作日（非周末）数量
     * 若 endDate 早于 monthStart，返回 0
     */
    private int countWorkdayUntil(LocalDate monthStart, LocalDate endDate) {
        if (endDate.isBefore(monthStart)) return 0;
        int count = 0;
        for (LocalDate d = monthStart; !d.isAfter(endDate); d = d.plusDays(1)) {
            if (!isWeekend(d)) count++;
        }
        return count;
    }

    private WorkAttendance findRecordByDate(List<WorkAttendance> records, LocalDate date) {
        if (records == null) return null;
        for (WorkAttendance r : records) {
            if (r.getWorkDate() != null && r.getWorkDate().equals(date)) return r;
        }
        return null;
    }

    /**
     * 异常状态判定
     * 返回 [status, statusText]
     */
    private String[] detectStatus(WorkAttendance r, LocalTime standardClockIn, LocalTime standardClockOut) {
        Integer workMinutes = r.getWorkMinutes();
        LocalDateTime clockIn = r.getClockInTime();
        LocalDateTime clockOut = r.getClockOutTime();

        // 漏打下班卡
        if (clockIn != null && clockOut == null) {
            return new String[]{"MISSING_CLOCK_OUT", "漏打下班卡"};
        }
        // 工时异常（<60分钟 或 >960分钟）
        if (workMinutes != null) {
            if (workMinutes < 60) return new String[]{"ABNORMAL", "工时异常"};
            if (workMinutes > 960) return new String[]{"ABNORMAL", "工时异常"};
        }
        // 迟到（上班打卡晚于 09:00）
        if (clockIn != null && clockIn.toLocalTime().isAfter(standardClockIn)) {
            // 同时早退则合并显示"迟到/早退"
            if (clockOut != null && clockOut.toLocalTime().isBefore(standardClockOut)) {
                return new String[]{"LATE_EARLY_LEAVE", "迟到/早退"};
            }
            return new String[]{"LATE", "迟到"};
        }
        // 早退（下班打卡早于 18:00）
        if (clockOut != null && clockOut.toLocalTime().isBefore(standardClockOut)) {
            return new String[]{"EARLY_LEAVE", "早退"};
        }
        return new String[]{"NORMAL", "正常"};
    }

    private UserContext requireUserContext() {
        UserContext ctx = UserContext.get();
        if (ctx == null || !StringUtils.hasText(ctx.getUserId()) || ctx.tenantId() == null) {
            throw new org.springframework.security.access.AccessDeniedException("未登录");
        }
        TenantAssert.assertTenantContext();
        return ctx;
    }

    /**
     * 计算当日工时（分钟）
     * - clock_in 或 clock_out 为空返回 0
     * - 封顶 24 小时（1440 分钟），避免跨天异常
     * - 不允许负数（clock_out 早于 clock_in 时返回 0）
     */
    private int computeWorkMinutes(LocalDateTime clockIn, LocalDateTime clockOut) {
        if (clockIn == null || clockOut == null) return 0;
        long minutes = Duration.between(clockIn, clockOut).toMinutes();
        if (minutes < 0) return 0;
        if (minutes > 1440) return 1440;
        return (int) minutes;
    }

    private Map<String, Object> buildStatusResp(WorkAttendance record, String message) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", message);
        if (record != null) {
            resp.put("clockInTime", record.getClockInTime());
            resp.put("clockOutTime", record.getClockOutTime());
            resp.put("workDate", record.getWorkDate());
            resp.put("workMinutes", record.getWorkMinutes() != null ? record.getWorkMinutes() : 0);
            resp.put("hasClockedIn", record.getClockInTime() != null);
            resp.put("hasClockedOut", record.getClockOutTime() != null);
        } else {
            resp.put("clockInTime", null);
            resp.put("clockOutTime", null);
            resp.put("workDate", LocalDate.now());
            resp.put("workMinutes", 0);
            resp.put("hasClockedIn", false);
            resp.put("hasClockedOut", false);
        }
        return resp;
    }
}
