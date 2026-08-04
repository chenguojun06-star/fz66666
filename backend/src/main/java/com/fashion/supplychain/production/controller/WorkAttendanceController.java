package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.WorkAttendanceOrchestrator;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 员工打卡 Controller
 * <p>
 * 1. 员工自助打卡（手机端首页，所有人可打）
 * 2. 管理端：管理员补录/修改/作废/批量休假（仅管理员角色）
 * <p>
 * 事务/业务规则在 WorkAttendanceOrchestrator（符合 D-001）。
 */
@Slf4j
@RestController
@RequestMapping("/api/production/attendance")
@PreAuthorize("isAuthenticated()")
public class WorkAttendanceController {

    @Autowired
    private WorkAttendanceOrchestrator workAttendanceOrchestrator;

    // ==================== 员工自助打卡 ====================

    /**
     * 上班打卡
     */
    @PostMapping("/clock-in")
    public Result<Map<String, Object>> clockIn() {
        Map<String, Object> result = workAttendanceOrchestrator.clockIn();
        return Result.success(result);
    }

    /**
     * 下班打卡
     */
    @PostMapping("/clock-out")
    public Result<Map<String, Object>> clockOut() {
        Map<String, Object> result = workAttendanceOrchestrator.clockOut();
        return Result.success(result);
    }

    /**
     * 今日打卡状态
     */
    @GetMapping("/today-status")
    public Result<Map<String, Object>> todayStatus() {
        Map<String, Object> result = workAttendanceOrchestrator.todayStatus();
        return Result.success(result);
    }

    /**
     * 本月工时统计
     */
    @GetMapping("/monthly-stats")
    public Result<Map<String, Object>> monthlyStats() {
        Map<String, Object> result = workAttendanceOrchestrator.monthlyStats();
        return Result.success(result);
    }

    /**
     * 月度打卡明细（手机端考勤详情页）
     */
    @GetMapping("/monthly-records")
    public Result<Map<String, Object>> monthlyRecords(@RequestParam(value = "month", required = false) String month) {
        Map<String, Object> result = workAttendanceOrchestrator.monthlyRecords(month);
        return Result.success(result);
    }

    // ==================== 管理端接口（仅管理员） ====================

    /**
     * 管理端列表查询
     */
    @GetMapping("/admin/list")
    public Result<Map<String, Object>> adminList(
            @RequestParam(value = "startDate", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam(value = "endDate", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
            @RequestParam(value = "userId", required = false) String userId,
            @RequestParam(value = "status", required = false) String status) {
        Map<String, Object> result = workAttendanceOrchestrator.adminList(startDate, endDate, userId, status);
        return Result.success(result);
    }

    /**
     * 管理员补录打卡
     */
    @PostMapping("/admin/supplement")
    public Result<Map<String, Object>> adminSupplement(
            @RequestParam("targetUserId") String targetUserId,
            @RequestParam(value = "targetUserName", required = false) String targetUserName,
            @RequestParam("workDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate workDate,
            @RequestParam(value = "clockInTime", required = false) String clockInTimeStr,
            @RequestParam(value = "clockOutTime", required = false) String clockOutTimeStr,
            @RequestParam(value = "remark", required = false) String remark) {
        LocalDateTime clockInTime = parseDateTime(clockInTimeStr);
        LocalDateTime clockOutTime = parseDateTime(clockOutTimeStr);
        Map<String, Object> result = workAttendanceOrchestrator.adminSupplement(
                targetUserId, targetUserName, workDate, clockInTime, clockOutTime, remark);
        return Result.success(result);
    }

    /**
     * 管理员修改打卡
     */
    @PostMapping("/admin/adjust")
    public Result<Map<String, Object>> adminAdjust(
            @RequestParam("id") Long id,
            @RequestParam(value = "clockInTime", required = false) String clockInTimeStr,
            @RequestParam(value = "clockOutTime", required = false) String clockOutTimeStr,
            @RequestParam(value = "remark", required = false) String remark) {
        LocalDateTime clockInTime = parseDateTime(clockInTimeStr);
        LocalDateTime clockOutTime = parseDateTime(clockOutTimeStr);
        Map<String, Object> result = workAttendanceOrchestrator.adminAdjust(id, clockInTime, clockOutTime, remark);
        return Result.success(result);
    }

    /**
     * 管理员作废打卡
     */
    @PostMapping("/admin/cancel")
    public Result<Map<String, Object>> adminCancel(
            @RequestParam("id") Long id,
            @RequestParam(value = "reason", required = false) String reason) {
        Map<String, Object> result = workAttendanceOrchestrator.adminCancel(id, reason);
        return Result.success(result);
    }

    /**
     * 管理员批量标记休假
     */
    @PostMapping("/admin/batch-leave")
    public Result<Map<String, Object>> adminBatchLeave(
            @RequestParam("targetUserId") String targetUserId,
            @RequestParam(value = "targetUserName", required = false) String targetUserName,
            @RequestParam("startDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam("endDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate,
            @RequestParam("leaveType") String leaveType,
            @RequestParam(value = "remark", required = false) String remark) {
        Map<String, Object> result = workAttendanceOrchestrator.adminBatchLeave(
                targetUserId, targetUserName, startDate, endDate, leaveType, remark);
        return Result.success(result);
    }

    // ==================== 工具方法 ====================

    /**
     * 解析 LocalDateTime，支持 yyyy-MM-dd HH:mm 和 yyyy-MM-dd HH:mm:ss
     */
    private LocalDateTime parseDateTime(String str) {
        if (str == null || str.trim().isEmpty()) return null;
        try {
            return LocalDateTime.parse(str, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(str, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            } catch (Exception ex) {
                throw new IllegalArgumentException("时间格式错误，请使用 yyyy-MM-dd HH:mm：" + str);
            }
        }
    }
}
