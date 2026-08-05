package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.AttendanceSupplementApplyOrchestrator;
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
 * 补卡申请 Controller
 * <p>
 * 1. 员工自助：提交申请、查看我的申请（所有人可访问）
 * 2. 管理端：待审批列表、审批通过/拒绝（仅管理员，权限在 Orchestrator.requireAdminContext 校验）
 * <p>
 * 事务/业务规则在 AttendanceSupplementApplyOrchestrator（符合 D-001）。
 */
@Slf4j
@RestController
@RequestMapping("/api/production/attendance/apply")
@PreAuthorize("isAuthenticated()")
public class AttendanceSupplementApplyController {

    @Autowired
    private AttendanceSupplementApplyOrchestrator applyOrchestrator;

    /** 员工提交补卡申请 */
    @PostMapping("/submit")
    public Result<Map<String, Object>> submit(
            @RequestParam("workDate") @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate workDate,
            @RequestParam(value = "clockInTime", required = false) String clockInTimeStr,
            @RequestParam(value = "clockOutTime", required = false) String clockOutTimeStr,
            @RequestParam(value = "reason", required = false) String reason) {
        LocalDateTime clockInTime = parseDateTime(clockInTimeStr);
        LocalDateTime clockOutTime = parseDateTime(clockOutTimeStr);
        Map<String, Object> result = applyOrchestrator.submitApply(workDate, clockInTime, clockOutTime, reason);
        return Result.success(result);
    }

    /** 员工查看我的申请列表 */
    @GetMapping("/my-list")
    public Result<Map<String, Object>> myList(
            @RequestParam(value = "month", required = false) String month) {
        Map<String, Object> result = applyOrchestrator.myApplies(month);
        return Result.success(result);
    }

    /** 管理员待审批列表 */
    @GetMapping("/pending-list")
    public Result<Map<String, Object>> pendingList(
            @RequestParam(value = "startDate", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate startDate,
            @RequestParam(value = "endDate", required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate endDate) {
        Map<String, Object> result = applyOrchestrator.pendingList(startDate, endDate);
        return Result.success(result);
    }

    /** 管理员审批通过 */
    @PostMapping("/approve")
    public Result<Map<String, Object>> approve(
            @RequestParam("applyId") Long applyId,
            @RequestParam(value = "approveRemark", required = false) String approveRemark) {
        Map<String, Object> result = applyOrchestrator.approve(applyId, approveRemark);
        return Result.success(result);
    }

    /** 管理员审批拒绝 */
    @PostMapping("/reject")
    public Result<Map<String, Object>> reject(
            @RequestParam("applyId") Long applyId,
            @RequestParam(value = "approveRemark", required = false) String approveRemark) {
        Map<String, Object> result = applyOrchestrator.reject(applyId, approveRemark);
        return Result.success(result);
    }

    /** 解析 LocalDateTime，支持 yyyy-MM-dd HH:mm 和 yyyy-MM-dd HH:mm:ss */
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
