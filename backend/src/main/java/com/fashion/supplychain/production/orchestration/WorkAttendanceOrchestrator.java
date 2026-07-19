package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 员工打卡编排器（事务边界，符合 D-001）
 * <p>
 * 业务规则：
 * 1. 上班打卡：今日无记录则创建；已有记录但 clock_in_time 为空则补齐；已存在则返回提示
 * 2. 下班打卡：今日有记录则更新 clock_out_time 并重算 work_minutes；
 *    若今日无记录（漏打上班卡），按当前时间创建一条补卡记录
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
            workAttendanceService.save(today_record);
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
        if (today_record == null) {
            // 漏打上班卡：按当前时间补一条上下班都打卡的记录
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

    // ==================== 私有方法 ====================

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
