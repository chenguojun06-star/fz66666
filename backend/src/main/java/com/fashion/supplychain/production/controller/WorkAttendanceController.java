package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.WorkAttendanceOrchestrator;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 员工打卡 Controller
 * <p>
 * 仅手机端首页使用：员工上下班打卡，统计本月工时。
 * 不做打卡限制（员工随意打卡），PC端前端不实现。
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
     * 返回：{ workHours, workDays, monthMinutes }
     */
    @GetMapping("/monthly-stats")
    public Result<Map<String, Object>> monthlyStats() {
        Map<String, Object> result = workAttendanceOrchestrator.monthlyStats();
        return Result.success(result);
    }
}
