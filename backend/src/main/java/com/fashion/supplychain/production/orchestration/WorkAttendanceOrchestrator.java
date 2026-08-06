package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    @Autowired
    private ScanRecordMapper scanRecordMapper;

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

        // 必须包含作废记录（delete_flag=1）——管理员作废后 delete_flag=1 但唯一索引仍占坑
        // 若用 findToday（过滤 delete_flag=0）会走新建分支，触发 uk_tenant_user_date 冲突
        WorkAttendance today_record = workAttendanceService.findTodayIncludingCancelled(tenantId, userId, today);
        boolean isCancelledSlot = today_record != null
                && ("CANCELLED".equals(today_record.getStatus()) || today_record.getDeleteFlag() != null && today_record.getDeleteFlag() == 1);
        if (today_record != null && today_record.getClockInTime() != null && !isCancelledSlot) {
            // 已上班打过卡（且非作废坑位），返回当前状态
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
                // 同样必须包含作废坑位（管理员刚作废/或另一个并发复用作废坑位同时 save）
                WorkAttendance existing = workAttendanceService.findTodayIncludingCancelled(tenantId, userId, today);
                if (existing != null && existing.getClockInTime() != null) {
                    log.warn("[clockIn] 并发兜底命中：tenantId={} userId={} clockInTime={}",
                            tenantId, userId, existing.getClockInTime());
                    return buildStatusResp(existing, "今日已上班打卡");
                }
                // 如果是作废坑位触发，直接复用作废的记录并 update
                if (existing != null) {
                    existing.setClockInTime(now);
                    existing.setUserName(userName);
                    existing.setFactoryId(factoryId);
                    existing.setDeleteFlag(0);
                    existing.setStatus("NORMAL");
                    existing.setSource("manual");
                    existing.setWorkMinutes(0);
                    workAttendanceService.updateById(existing);
                    return buildStatusResp(existing, "上班打卡成功");
                }
                throw dke;
            }
        } else {
            // 两种场景：1）正常坑位但 clockInTime 为空（数据异常兜底）
            //         2）作废坑位（isCancelledSlot=true），复用作废的坑位，恢复为正常打卡状态
            today_record.setClockInTime(now);
            today_record.setUserName(userName);
            today_record.setFactoryId(factoryId);
            today_record.setDeleteFlag(0);
            if (isCancelledSlot) {
                today_record.setStatus("NORMAL");
                today_record.setSource("manual");
                today_record.setClockOutTime(null); // 作废的老下班卡清空，避免干扰工时计算
                today_record.setWorkMinutes(0);
            }
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

        // 必须包含作废记录（delete_flag=1）——管理员作废后 delete_flag=1 但唯一索引仍占坑
        // 用 findToday（过滤 delete_flag=0）会让 save 新建分支触发 uk_tenant_user_date 冲突
        WorkAttendance today_record = workAttendanceService.findTodayIncludingCancelled(tenantId, userId, today);
        boolean isCancelledSlot = today_record != null
                && ("CANCELLED".equals(today_record.getStatus()) || today_record.getDeleteFlag() != null && today_record.getDeleteFlag() == 1);

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
            try {
                workAttendanceService.save(today_record);
            } catch (org.springframework.dao.DuplicateKeyException dke) {
                // 并发/作废兜底：另一线程同时 clockOut 或管理员刚作废今天的卡，唯一索引冲突
                WorkAttendance dupExisting = workAttendanceService.findTodayIncludingCancelled(tenantId, userId, today);
                if (dupExisting != null) {
                    boolean dupCancelled = "CANCELLED".equals(dupExisting.getStatus())
                            || (dupExisting.getDeleteFlag() != null && dupExisting.getDeleteFlag() == 1);
                    dupExisting.setClockOutTime(now);
                    // 如果作废坑位连 clockInTime 都没有，补成跟 clockOutTime 一样（漏打上班卡逻辑）
                    if (dupExisting.getClockInTime() == null || dupCancelled) {
                        dupExisting.setClockInTime(now);
                    }
                    dupExisting.setWorkMinutes(computeWorkMinutes(dupExisting.getClockInTime(), now));
                    dupExisting.setUserName(userName);
                    dupExisting.setFactoryId(factoryId);
                    dupExisting.setDeleteFlag(0);
                    if (dupCancelled) {
                        dupExisting.setStatus("NORMAL");
                        dupExisting.setSource("manual");
                    }
                    workAttendanceService.updateById(dupExisting);
                    log.info("[clockOut] 并发复用（作废）坑位 tenantId={} userId={} clockOutTime={}",
                            tenantId, userId, now);
                    return buildStatusResp(dupExisting, dupExisting.getClockInTime() != null
                            && !now.equals(dupExisting.getClockInTime()) ? "下班打卡成功"
                            : "已补打上下班卡（漏打上班卡）");
                }
                throw dke;
            }
            log.info("[clockOut] tenantId={} userId={} 补打上下班卡 clockInTime=clockOutTime={}",
                    tenantId, userId, now);
            return buildStatusResp(today_record, "已补打上下班卡（漏打上班卡）");
        }

        // 已有上班打卡记录，更新下班时间 + 重算工时
        // 如果是作废坑位，需要恢复 delete_flag=0 和 status=NORMAL，确保数据不留在作废状态
        today_record.setClockOutTime(now);
        today_record.setWorkMinutes(computeWorkMinutes(today_record.getClockInTime() == null ? now : today_record.getClockInTime(), now));
        today_record.setUserName(userName);
        today_record.setFactoryId(factoryId);
        today_record.setDeleteFlag(0);
        if (isCancelledSlot) {
            today_record.setStatus("NORMAL");
            today_record.setSource("manual");
            if (today_record.getClockInTime() == null) {
                today_record.setClockInTime(now);
            }
        }
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

        // 批量查询当前员工当月每日扫码产量+金额（避免 N+1）
        // key = workDate(yyyy-MM-dd)，value = {scanQty, scanAmount}
        Map<String, Map<String, Object>> dailyScanMap = new HashMap<>();
        if (StringUtils.hasText(userId)) {
            List<String> opIds = new ArrayList<>();
            opIds.add(userId);
            try {
                LocalDateTime startTime = monthStart.atStartOfDay();
                LocalDateTime endTime = monthEnd.plusDays(1).atStartOfDay();
                List<Map<String, Object>> rows = scanRecordMapper.selectDailyStatsByOperators(
                        tenantId, opIds, startTime, endTime);
                if (rows != null) {
                    for (Map<String, Object> row : rows) {
                        Object workDateObj = row.get("workDate");
                        String workDateStr = workDateObj != null ? workDateObj.toString() : null;
                        if (workDateStr != null && workDateStr.length() >= 10) {
                            workDateStr = workDateStr.substring(0, 10);
                            dailyScanMap.put(workDateStr, row);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[monthlyRecords] 查询扫码产量失败 tenantId={} userId={} month={} err={}",
                        tenantId, userId, ym, e.getMessage());
            }
        }

        // 明细列表
        List<Map<String, Object>> recordList = new ArrayList<>();
        long monthScanQty = 0;
        double monthScanAmount = 0;
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
            item.put("leaveType", r.getLeaveType());
            item.put("leaveTypeText", translateLeaveType(r.getLeaveType()));
            item.put("source", r.getSource());
            item.put("operatorName", r.getOperatorName());

            // 关联当日扫码产量+金额
            String dateKey = r.getWorkDate() != null ? r.getWorkDate().toString() : null;
            Map<String, Object> scanData = dateKey != null ? dailyScanMap.get(dateKey) : null;
            long scanQty = scanData != null ? toLong(scanData.get("scanQty")) : 0;
            double scanAmount = scanData != null ? toDouble(scanData.get("scanAmount")) : 0;
            item.put("scanQty", scanQty);
            item.put("scanAmount", Math.round(scanAmount * 100.0) / 100.0);

            // 显式 status 优先（LEAVE/ADJUSTED/CANCELLED 等管理态）；NULL/历史数据按时间自动判定
            String explicitStatus = r.getStatus();
            if (StringUtils.hasText(explicitStatus)) {
                item.put("status", explicitStatus);
                item.put("statusText", translateStatus(explicitStatus, r, standardClockIn, standardClockOut));
            } else {
                String[] statusInfo = detectStatus(r, standardClockIn, standardClockOut);
                item.put("status", statusInfo[0]);
                item.put("statusText", statusInfo[1]);
            }
            // 累加月度产量/金额（仅非作废记录）
            if (!"CANCELLED".equals(item.get("status"))) {
                monthScanQty += scanQty;
                monthScanAmount += scanAmount;
            }
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
                // 显式 status 优先；NULL 按时间自动判定
                String matchStatus = match.getStatus();
                if (!StringUtils.hasText(matchStatus)) {
                    String[] statusInfo = detectStatus(match, standardClockIn, standardClockOut);
                    matchStatus = statusInfo[0];
                }
                day.put("status", matchStatus);
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
        summary.put("monthScanQty", monthScanQty);
        summary.put("monthScanAmount", Math.round(monthScanAmount * 100.0) / 100.0);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("month", ym.toString());
        resp.put("summary", summary);
        resp.put("records", recordList);
        resp.put("calendar", calendar);
        return resp;
    }

    // ==================== 管理端方法（管理员补录/修改/作废/批量休假） ====================

    /**
     * 管理端列表查询
     * <p>
     * 关联展示：考勤 + 当日扫码产量(scanQty) + 当日工序金额(scanAmount)
     * 工资口径：scanCost/processUnitPrice×quantity（与 selectPersonalStats 一致）
     * 产量口径：所有 scan_type（除 orchestration）的 quantity 总和
     */
    public Map<String, Object> adminList(LocalDate startDate, LocalDate endDate,
                                         String userId, String status) {
        UserContext ctx = requireAdminContext();
        Long tenantId = ctx.tenantId();

        // 默认查询当月
        if (startDate == null) startDate = LocalDate.now().withDayOfMonth(1);
        if (endDate == null) endDate = LocalDate.now();

        List<WorkAttendance> records = workAttendanceService.listForAdmin(tenantId, startDate, endDate, userId, status);
        Map<String, Object> stats = workAttendanceService.adminStats(tenantId, startDate, endDate);

        // 批量查询考勤范围内所有员工的每日扫码产量+金额（避免 N+1）
        // key = operatorId + "|" + workDate，value = {scanQty, scanAmount}
        Map<String, Map<String, Object>> dailyScanMap = buildDailyScanMap(tenantId, records, startDate, endDate);

        List<Map<String, Object>> list = new ArrayList<>();
        LocalTime stdIn = LocalTime.of(9, 0);
        LocalTime stdOut = LocalTime.of(18, 0);
        long totalScanQty = 0;
        double totalScanAmount = 0;
        for (WorkAttendance r : records) {
            Map<String, Object> item = buildAdminRecordItem(r, stdIn, stdOut);
            // 关联当日产量+金额
            String key = buildDailyScanKey(r.getUserId(), r.getWorkDate());
            Map<String, Object> scanData = dailyScanMap.get(key);
            long scanQty = scanData != null ? toLong(scanData.get("scanQty")) : 0;
            double scanAmount = scanData != null ? toDouble(scanData.get("scanAmount")) : 0;
            item.put("scanQty", scanQty);
            item.put("scanAmount", Math.round(scanAmount * 100.0) / 100.0);
            // 累加总计（仅非作废记录）
            if (!"CANCELLED".equals(item.get("status"))) {
                totalScanQty += scanQty;
                totalScanAmount += scanAmount;
            }
            list.add(item);
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("startDate", startDate.toString());
        resp.put("endDate", endDate.toString());
        resp.put("stats", buildAdminStats(stats, totalScanQty, totalScanAmount));
        resp.put("records", list);
        resp.put("total", list.size());
        return resp;
    }

    /**
     * 批量查询考勤记录范围内所有员工的每日扫码产量+金额
     * 返回 Map<operatorId|workDate, {scanQty, scanAmount}>
     * <p>
     * 性能：单次 SQL 批量查询，避免 N+1
     * 容错：查询失败返回空 Map，不影响考勤主流程
     */
    private Map<String, Map<String, Object>> buildDailyScanMap(Long tenantId, List<WorkAttendance> records,
                                                                LocalDate startDate, LocalDate endDate) {
        if (records == null || records.isEmpty()) return new HashMap<>();
        // 收集去重的 operatorId 列表
        Set<String> operatorIds = new HashSet<>();
        for (WorkAttendance r : records) {
            if (StringUtils.hasText(r.getUserId())) {
                operatorIds.add(r.getUserId());
            }
        }
        if (operatorIds.isEmpty()) return new HashMap<>();

        try {
            // scan_time 范围：startDate 00:00 ~ endDate+1day 00:00
            LocalDateTime startTime = startDate.atStartOfDay();
            LocalDateTime endTime = endDate.plusDays(1).atStartOfDay();
            List<Map<String, Object>> rows = scanRecordMapper.selectDailyStatsByOperators(
                    tenantId, new ArrayList<>(operatorIds), startTime, endTime);
            Map<String, Map<String, Object>> map = new HashMap<>();
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    String opId = row.get("operatorId") != null ? String.valueOf(row.get("operatorId")) : null;
                    Object workDateObj = row.get("workDate");
                    String workDateStr = workDateObj != null ? workDateObj.toString() : null;
                    if (opId == null || workDateStr == null) continue;
                    // workDate 可能是 "yyyy-MM-dd" 或 "yyyy-MM-dd 00:00:00"，统一取前10位
                    if (workDateStr.length() >= 10) workDateStr = workDateStr.substring(0, 10);
                    map.put(opId + "|" + workDateStr, row);
                }
            }
            return map;
        } catch (Exception e) {
            log.warn("[buildDailyScanMap] 查询扫码产量失败 tenantId={} range={}~{} err={}",
                    tenantId, startDate, endDate, e.getMessage());
            return new HashMap<>();
        }
    }

    /**
     * 构建每日扫码关联 key：operatorId + "|" + workDate(yyyy-MM-dd)
     */
    private String buildDailyScanKey(String operatorId, LocalDate workDate) {
        if (operatorId == null || workDate == null) return "";
        return operatorId + "|" + workDate.toString();
    }

    /**
     * 管理员补录打卡（员工漏打卡时管理员代为补录）
     */
    @Transactional
    public Map<String, Object> adminSupplement(String targetUserId, String targetUserName,
                                               LocalDate workDate,
                                               LocalDateTime clockInTime, LocalDateTime clockOutTime,
                                               String remark) {
        UserContext ctx = requireAdminContext();
        Long tenantId = ctx.tenantId();

        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("请选择员工");
        }
        if (workDate == null) {
            throw new IllegalArgumentException("请选择打卡日期");
        }
        if (clockInTime == null && clockOutTime == null) {
            throw new IllegalArgumentException("上班时间和下班时间至少填一项");
        }
        // 不允许补录未来日期
        if (workDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("不允许补录未来日期");
        }

        // 检查是否已有记录（含已作废的）——作废后 delete_flag=1，唯一索引仍占坑，必须通过 update 复用
        // 不能用 findToday（过滤 delete_flag=0），否则作废后补录会走新建分支，触发 uk_tenant_user_date 冲突
        WorkAttendance existing = workAttendanceService.findTodayIncludingCancelled(tenantId, targetUserId, workDate);
        if (existing != null && !"CANCELLED".equals(existing.getStatus())) {
            throw new IllegalStateException("该员工当天已有打卡记录，请使用「修改」功能");
        }

        int workMinutes = computeWorkMinutes(clockInTime, clockOutTime);

        if (existing != null) {
            // 复用作废记录的坑位
            existing.setClockInTime(clockInTime);
            existing.setClockOutTime(clockOutTime);
            existing.setWorkMinutes(workMinutes);
            existing.setWorkDate(workDate);
            existing.setUserName(targetUserName);
            existing.setStatus("ADJUSTED");
            existing.setSource("admin_adjust");
            existing.setOperatorId(ctx.getUserId());
            existing.setOperatorName(ctx.getUsername());
            existing.setOperateTime(LocalDateTime.now());
            existing.setRemark(remark);
            existing.setDeleteFlag(0);
            workAttendanceService.updateById(existing);
            log.info("[adminSupplement] 复用作废坑位 tenantId={} targetUser={} workDate={} operator={}",
                    tenantId, targetUserId, workDate, ctx.getUserId());
        } else {
            WorkAttendance record = new WorkAttendance();
            record.setTenantId(tenantId);
            record.setUserId(targetUserId);
            record.setUserName(targetUserName);
            record.setFactoryId(ctx.factoryId());
            record.setWorkDate(workDate);
            record.setClockInTime(clockInTime);
            record.setClockOutTime(clockOutTime);
            record.setWorkMinutes(workMinutes);
            record.setSource("admin_adjust");
            record.setStatus("ADJUSTED");
            record.setOperatorId(ctx.getUserId());
            record.setOperatorName(ctx.getUsername());
            record.setOperateTime(LocalDateTime.now());
            record.setRemark(remark);
            record.setDeleteFlag(0);
            try {
                workAttendanceService.save(record);
            } catch (org.springframework.dao.DuplicateKeyException dke) {
                // 并发兜底：另一线程同时补录同一天同一员工，已创建则复用
                WorkAttendance dupExisting = workAttendanceService.findTodayIncludingCancelled(tenantId, targetUserId, workDate);
                if (dupExisting != null) {
                    if ("CANCELLED".equals(dupExisting.getStatus())) {
                        // 刚好另一线程把作废的改回正常？走 update
                        dupExisting.setClockInTime(clockInTime);
                        dupExisting.setClockOutTime(clockOutTime);
                        dupExisting.setWorkMinutes(workMinutes);
                        dupExisting.setUserName(targetUserName);
                        dupExisting.setStatus("ADJUSTED");
                        dupExisting.setSource("admin_adjust");
                        dupExisting.setOperatorId(ctx.getUserId());
                        dupExisting.setOperatorName(ctx.getUsername());
                        dupExisting.setOperateTime(LocalDateTime.now());
                        dupExisting.setRemark(remark);
                        dupExisting.setDeleteFlag(0);
                        workAttendanceService.updateById(dupExisting);
                        log.info("[adminSupplement] 并发复用坑位 tenantId={} targetUser={} workDate={} operator={}",
                                tenantId, targetUserId, workDate, ctx.getUserId());
                    } else {
                        throw new IllegalStateException("该员工当天已有打卡记录，请使用「修改」功能");
                    }
                } else {
                    throw dke;
                }
            }
            log.info("[adminSupplement] 新增补录 tenantId={} targetUser={} workDate={} operator={}",
                    tenantId, targetUserId, workDate, ctx.getUserId());
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "补录成功");
        return resp;
    }

    /**
     * 员工自助补卡（仅为自己补卡，只能补过去日期）
     * 与 adminSupplement 区别：权限为普通登录用户，targetUserId 强制为当前用户
     */
    @Transactional
    public Map<String, Object> selfSupplement(LocalDate workDate,
                                              LocalDateTime clockInTime, LocalDateTime clockOutTime,
                                              String remark) {
        UserContext ctx = requireUserContext();
        Long tenantId = ctx.tenantId();
        String targetUserId = ctx.getUserId();
        String targetUserName = ctx.getUsername();

        if (workDate == null) {
            throw new IllegalArgumentException("请选择打卡日期");
        }
        if (clockInTime == null && clockOutTime == null) {
            throw new IllegalArgumentException("上班时间和下班时间至少填一项");
        }
        // 不允许补未来日期
        if (workDate.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("不允许补未来日期");
        }
        // 不允许补当天（当天应直接打卡）
        if (workDate.equals(LocalDate.now())) {
            throw new IllegalArgumentException("当天请直接打卡，无需补卡");
        }

        // 员工自助补卡也必须包含作废记录——管理员作废后用户不能再自助补卡？
        // 实际上管理员作废=删除，用户可以再补。但唯一索引占坑，必须复用作废的坑位。
        WorkAttendance existing = workAttendanceService.findTodayIncludingCancelled(tenantId, targetUserId, workDate);
        if (existing != null && !"CANCELLED".equals(existing.getStatus())) {
            throw new IllegalStateException("当天已有打卡记录，请联系管理员修改");
        }

        int workMinutes = computeWorkMinutes(clockInTime, clockOutTime);

        if (existing != null) {
            existing.setClockInTime(clockInTime);
            existing.setClockOutTime(clockOutTime);
            existing.setWorkMinutes(workMinutes);
            existing.setWorkDate(workDate);
            existing.setUserName(targetUserName);
            existing.setStatus("ADJUSTED");
            existing.setSource("self_supplement");
            existing.setOperatorId(ctx.getUserId());
            existing.setOperatorName(ctx.getUsername());
            existing.setOperateTime(LocalDateTime.now());
            existing.setRemark(remark);
            existing.setDeleteFlag(0);
            workAttendanceService.updateById(existing);
            log.info("[selfSupplement] 复用作废坑位 tenantId={} user={} workDate={}",
                    tenantId, targetUserId, workDate);
        } else {
            WorkAttendance record = new WorkAttendance();
            record.setTenantId(tenantId);
            record.setUserId(targetUserId);
            record.setUserName(targetUserName);
            record.setFactoryId(ctx.factoryId());
            record.setWorkDate(workDate);
            record.setClockInTime(clockInTime);
            record.setClockOutTime(clockOutTime);
            record.setWorkMinutes(workMinutes);
            record.setSource("self_supplement");
            record.setStatus("ADJUSTED");
            record.setOperatorId(ctx.getUserId());
            record.setOperatorName(ctx.getUsername());
            record.setOperateTime(LocalDateTime.now());
            record.setRemark(remark);
            record.setDeleteFlag(0);
            try {
                workAttendanceService.save(record);
            } catch (org.springframework.dao.DuplicateKeyException dke) {
                // 并发兜底：管理员同时补录/员工并发提交补卡
                WorkAttendance dupExisting = workAttendanceService.findTodayIncludingCancelled(tenantId, targetUserId, workDate);
                if (dupExisting != null) {
                    if ("CANCELLED".equals(dupExisting.getStatus())) {
                        dupExisting.setClockInTime(clockInTime);
                        dupExisting.setClockOutTime(clockOutTime);
                        dupExisting.setWorkMinutes(workMinutes);
                        dupExisting.setUserName(targetUserName);
                        dupExisting.setStatus("ADJUSTED");
                        dupExisting.setSource("self_supplement");
                        dupExisting.setOperatorId(ctx.getUserId());
                        dupExisting.setOperatorName(ctx.getUsername());
                        dupExisting.setOperateTime(LocalDateTime.now());
                        dupExisting.setRemark(remark);
                        dupExisting.setDeleteFlag(0);
                        workAttendanceService.updateById(dupExisting);
                        log.info("[selfSupplement] 并发复用坑位 tenantId={} user={} workDate={}",
                                tenantId, targetUserId, workDate);
                    } else {
                        throw new IllegalStateException("当天已有打卡记录，请联系管理员修改");
                    }
                } else {
                    throw dke;
                }
            }
            log.info("[selfSupplement] 新增补卡 tenantId={} user={} workDate={}",
                    tenantId, targetUserId, workDate);
        }

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "补卡成功");
        return resp;
    }

    /**
     * 管理员修改打卡（调整错误打卡时间）
     */
    @Transactional
    public Map<String, Object> adminAdjust(Long id, LocalDateTime clockInTime, LocalDateTime clockOutTime,
                                           String remark) {
        UserContext ctx = requireAdminContext();
        Long tenantId = ctx.tenantId();

        if (id == null) {
            throw new IllegalArgumentException("记录ID不能为空");
        }
        WorkAttendance record = workAttendanceService.getById(id);
        if (record == null || !tenantId.equals(record.getTenantId())) {
            throw new IllegalStateException("记录不存在或无权访问");
        }
        if ("CANCELLED".equals(record.getStatus())) {
            throw new IllegalStateException("已作废的记录不能再修改");
        }
        if ("LEAVE".equals(record.getStatus())) {
            throw new IllegalStateException("休假记录请使用「批量休假」功能修改");
        }

        if (clockInTime != null) record.setClockInTime(clockInTime);
        if (clockOutTime != null) record.setClockOutTime(clockOutTime);
        record.setWorkMinutes(computeWorkMinutes(record.getClockInTime(), record.getClockOutTime()));
        record.setStatus("ADJUSTED");
        record.setOperatorId(ctx.getUserId());
        record.setOperatorName(ctx.getUsername());
        record.setOperateTime(LocalDateTime.now());
        if (StringUtils.hasText(remark)) record.setRemark(remark);
        workAttendanceService.updateById(record);

        log.info("[adminAdjust] id={} tenantId={} operator={} clockIn={} clockOut={}",
                id, tenantId, ctx.getUserId(), record.getClockInTime(), record.getClockOutTime());

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "修改成功");
        return resp;
    }

    /**
     * 管理员作废打卡记录（异常打卡、误打卡）
     * 软删除：delete_flag=1 + status=CANCELLED，保留审计痕迹
     */
    @Transactional
    public Map<String, Object> adminCancel(Long id, String reason) {
        UserContext ctx = requireAdminContext();
        Long tenantId = ctx.tenantId();

        if (id == null) {
            throw new IllegalArgumentException("记录ID不能为空");
        }
        WorkAttendance record = workAttendanceService.getById(id);
        if (record == null || !tenantId.equals(record.getTenantId())) {
            throw new IllegalStateException("记录不存在或无权访问");
        }
        if ("CANCELLED".equals(record.getStatus())) {
            throw new IllegalStateException("记录已作废");
        }

        record.setStatus("CANCELLED");
        record.setOperatorId(ctx.getUserId());
        record.setOperatorName(ctx.getUsername());
        record.setOperateTime(LocalDateTime.now());
        record.setDeleteFlag(1);
        String prefix = StringUtils.hasText(reason) ? ("[作废原因：" + reason + "] ") : "";
        record.setRemark(prefix + (StringUtils.hasText(record.getRemark()) ? record.getRemark() : ""));
        workAttendanceService.updateById(record);

        log.info("[adminCancel] id={} tenantId={} operator={} reason={}",
                id, tenantId, ctx.getUserId(), reason);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "作废成功");
        return resp;
    }

    /**
     * 管理员批量标记休假
     * 给指定员工在日期范围内每天创建一条 status=LEAVE 的记录
     * 已有非作废记录的日期跳过（避免冲突）
     */
    @Transactional
    public Map<String, Object> adminBatchLeave(String targetUserId, String targetUserName,
                                               LocalDate startDate, LocalDate endDate,
                                               String leaveType, String remark) {
        UserContext ctx = requireAdminContext();
        Long tenantId = ctx.tenantId();

        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("请选择员工");
        }
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("请选择日期范围");
        }
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("结束日期不能早于开始日期");
        }
        if (!StringUtils.hasText(leaveType)) {
            throw new IllegalArgumentException("请选择休假类型");
        }

        // 限制单次最大 31 天，防止误操作
        long days = java.time.temporal.ChronoUnit.DAYS.between(startDate, endDate) + 1;
        if (days > 31) {
            throw new IllegalArgumentException("单次标记不能超过31天");
        }

        // 查询已有记录
        List<WorkAttendance> existing = workAttendanceService.listByUserAndDateRange(
                tenantId, targetUserId, startDate, endDate);
        Map<LocalDate, WorkAttendance> existingMap = new LinkedHashMap<>();
        for (WorkAttendance r : existing) {
            if (r.getWorkDate() != null && !"CANCELLED".equals(r.getStatus())) {
                existingMap.put(r.getWorkDate(), r);
            }
        }

        int created = 0;
        int skipped = 0;
        for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
            if (existingMap.containsKey(d)) {
                skipped++;
                continue;
            }
            WorkAttendance record = new WorkAttendance();
            record.setTenantId(tenantId);
            record.setUserId(targetUserId);
            record.setUserName(targetUserName);
            record.setFactoryId(ctx.factoryId());
            record.setWorkDate(d);
            record.setWorkMinutes(0);
            record.setSource("admin_adjust");
            record.setStatus("LEAVE");
            record.setLeaveType(leaveType);
            record.setOperatorId(ctx.getUserId());
            record.setOperatorName(ctx.getUsername());
            record.setOperateTime(LocalDateTime.now());
            record.setRemark(remark);
            record.setDeleteFlag(0);
            workAttendanceService.save(record);
            created++;
        }

        log.info("[adminBatchLeave] tenantId={} targetUser={} range={}~{} leaveType={} created={} skipped={}",
                tenantId, targetUserId, startDate, endDate, leaveType, created, skipped);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "标记完成：新增 " + created + " 天" + (skipped > 0 ? "，跳过 " + skipped + " 天（已有记录）" : ""));
        resp.put("created", created);
        resp.put("skipped", skipped);
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
     * 管理员上下文校验（P0 铁律：权限交给后端）
     * 仅 admin/manager/supervisor/主管/管理员 角色或租户主账号可调用管理端接口
     * 使用 isSupervisorOrAbove 统一判定，与项目其他模块（如财税导出）保持一致
     */
    private UserContext requireAdminContext() {
        UserContext ctx = requireUserContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("无权限：仅管理员可操作");
        }
        return ctx;
    }

    /**
     * 构建管理端列表 item（包含状态文本和异常标记）
     */
    private Map<String, Object> buildAdminRecordItem(WorkAttendance r, LocalTime stdIn, LocalTime stdOut) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", r.getId());
        item.put("userId", r.getUserId());
        item.put("userName", r.getUserName());
        item.put("workDate", r.getWorkDate() != null ? r.getWorkDate().toString() : null);
        item.put("clockInTime", formatDateTime(r.getClockInTime()));
        item.put("clockOutTime", formatDateTime(r.getClockOutTime()));
        item.put("workMinutes", r.getWorkMinutes() != null ? r.getWorkMinutes() : 0);
        item.put("workHours", formatHours(r.getWorkMinutes()));
        item.put("source", r.getSource());
        item.put("leaveType", r.getLeaveType());
        item.put("leaveTypeText", translateLeaveType(r.getLeaveType()));
        item.put("operatorId", r.getOperatorId());
        item.put("operatorName", r.getOperatorName());
        item.put("operateTime", formatDateTime(r.getOperateTime()));
        item.put("remark", r.getRemark());

        // 显式 status 优先；NULL（历史数据）按时间自动判定
        String status = r.getStatus();
        if (!StringUtils.hasText(status)) {
            if (r.getDeleteFlag() != null && r.getDeleteFlag() == 1) {
                status = "CANCELLED";
            } else {
                String[] detected = detectStatus(r, stdIn, stdOut);
                status = detected[0];
            }
        }
        item.put("status", status);
        item.put("statusText", translateStatus(status, r, stdIn, stdOut));
        return item;
    }

    /**
     * 状态文本翻译（包含 LEAVE/ADJUSTED/CANCELLED 管理态）
     */
    private String translateStatus(String status, WorkAttendance r, LocalTime stdIn, LocalTime stdOut) {
        if (status == null) return "未知";
        switch (status) {
            case "LEAVE": return translateLeaveType(r.getLeaveType());
            case "ADJUSTED": return "管理员调整";
            case "CANCELLED": return "已作废";
            default:
                String[] detected = detectStatus(r, stdIn, stdOut);
                return detected[1];
        }
    }

    private String translateLeaveType(String leaveType) {
        if (leaveType == null) return "休假";
        switch (leaveType) {
            case "LEGAL_HOLIDAY": return "法定节假日";
            case "SICK": return "病假";
            case "PERSONAL": return "事假";
            case "ANNUAL": return "年假";
            case "MATERNITY": return "产假";
            case "OTHER": return "其他休假";
            default: return "休假";
        }
    }

    /**
     * 构建管理端统计
     * @param raw 原始考勤统计
     * @param totalScanQty 总扫码产量（非作废记录）
     * @param totalScanAmount 总工序金额（非作废记录）
     */
    private Map<String, Object> buildAdminStats(Map<String, Object> raw, long totalScanQty, double totalScanAmount) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", toInt(raw == null ? null : raw.get("total")));
        stats.put("normalCount", toInt(raw == null ? null : raw.get("normalCount")));
        stats.put("leaveCount", toInt(raw == null ? null : raw.get("leaveCount")));
        stats.put("adjustedCount", toInt(raw == null ? null : raw.get("adjustedCount")));
        stats.put("cancelledCount", toInt(raw == null ? null : raw.get("cancelledCount")));
        long minutes = toLong(raw == null ? null : raw.get("totalMinutes"));
        stats.put("totalMinutes", minutes);
        stats.put("totalHours", Math.round(minutes / 60.0 * 10.0) / 10.0);
        stats.put("totalScanQty", totalScanQty);
        stats.put("totalScanAmount", Math.round(totalScanAmount * 100.0) / 100.0);
        return stats;
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
