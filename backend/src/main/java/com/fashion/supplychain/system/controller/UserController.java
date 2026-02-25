package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.UserOrchestrator;
import com.fashion.supplychain.system.service.LoginLogService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 用户控制器
 */
@RestController
@RequestMapping("/api/system/user")
@PreAuthorize("isAuthenticated()")
public class UserController {

    @Autowired
    private UserOrchestrator userOrchestrator;

    @Autowired
    private LoginLogService loginLogService;

    /**
     * 分页查询用户列表
     *
     * @param page     当前页码
     * @param pageSize 每页条数
     * @param username 用户名
     * @param name     姓名
     * @param roleName 角色名称
     * @param status   状态
     * @return 分页结果
     */
    @GetMapping("/list")
    public Result<?> getUserList(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String roleName,
            @RequestParam(required = false) String status) {
        Page<User> userPage = userOrchestrator.list(page, pageSize, username, name, roleName, status);
        return Result.success(userPage);
    }

    /**
     * 获取用户详情
     *
     * @param id 用户ID
     * @return 用户信息
     */
    @GetMapping("/{id}")
    public Result<?> getUserById(@PathVariable Long id) {
        return Result.success(userOrchestrator.getById(id));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/me")
    public Result<?> me() {
        return Result.success(userOrchestrator.me());
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/me")
    public Result<?> updateMe(@RequestBody User user) {
        return Result.success(userOrchestrator.updateMe(user));
    }

    /**
     * 新增用户
     *
     * @param user 用户信息
     * @return 操作结果
     */
    @PostMapping
    public Result<?> addUser(@RequestBody User user) {
        userOrchestrator.add(user);
        return Result.successMessage("新增成功");
    }

    /**
     * 更新用户
     *
     * @param user 用户信息
     * @return 操作结果
     */
    @PutMapping
    public Result<?> updateUser(@RequestBody User user) {
        userOrchestrator.update(user);
        return Result.successMessage("更新成功");
    }

    /**
     * 删除用户
     *
     * @param id 用户ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public Result<?> deleteUser(@PathVariable Long id,
            @RequestParam(required = false) String remark) {
        userOrchestrator.delete(id, remark);
        return Result.successMessage("删除成功");
    }

    /**
     * 切换用户状态
     *
     * @param id     用户ID
     * @param status 状态
     * @return 操作结果
     */
    @PutMapping("/status")
    public Result<?> toggleStatus(@RequestParam Long id, @RequestParam String status,
            @RequestParam(required = false) String remark) {
        userOrchestrator.toggleStatus(id, status, remark);
        return Result.successMessage("状态切换成功");
    }

    /**
     * 用户登录
     *
     * @param loginData 登录信息
     * @return 登录结果
     */
    @PostMapping("/login")
    @PreAuthorize("permitAll()")
    public Result<?> login(@RequestBody User loginData, HttpServletRequest request) {
        String username = loginData == null ? null : loginData.getUsername();
        String ip = resolveClientIp(request);
        userOrchestrator.assertLoginAllowed(safeTrim(username), safeTrim(ip));
        try {
            Object payloadObj = userOrchestrator.loginWithToken(loginData);
            User user = null;
            if (payloadObj instanceof java.util.Map<?, ?> map) {
                Object u = map.get("user");
                if (u instanceof User user1) {
                    user = user1;
                }
            }
            userOrchestrator.recordLoginAttempt(
                    safeTrim(username),
                    user == null ? null : safeTrim(user.getName()),
                    ip,
                    request == null ? null : request.getHeader("User-Agent"),
                    "SUCCESS",
                    "登录成功");
            userOrchestrator.onLoginSuccess(safeTrim(username), safeTrim(ip));
            return Result.success(payloadObj);
        } catch (RuntimeException e) {
            userOrchestrator.onLoginFailed(safeTrim(username), safeTrim(ip));
            userOrchestrator.recordLoginAttempt(
                    safeTrim(username),
                    null,
                    ip,
                    request == null ? null : request.getHeader("User-Agent"),
                    "FAILED",
                    e.getMessage());
            throw e;
        }
    }

    @GetMapping("/online-count")
    public Result<?> onlineCount() {
        LocalDateTime since = LocalDateTime.now().minusMinutes(10);
        List<LoginLog> logs = loginLogService.list(new LambdaQueryWrapper<LoginLog>()
                .select(LoginLog::getUsername, LoginLog::getLoginTime, LoginLog::getLoginStatus)
                .eq(LoginLog::getLoginStatus, "SUCCESS")
                .ge(LoginLog::getLoginTime, since));
        Set<String> users = new HashSet<>();
        if (logs != null) {
            for (LoginLog log : logs) {
                String u = log == null ? null : safeTrim(log.getUsername());
                if (u != null) {
                    users.add(u);
                }
            }
        }
        return Result.success(users.size());
    }

    private static String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        String[] headerNames = new String[] { "X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP",
                "WL-Proxy-Client-IP" };
        for (String h : headerNames) {
            String v = request.getHeader(h);
            if (v == null || v.isBlank() || "unknown".equalsIgnoreCase(v)) {
                continue;
            }
            String first = v.split(",")[0];
            String ip = first == null ? null : first.trim();
            if (ip != null && !ip.isBlank() && !"unknown".equalsIgnoreCase(ip)) {
                return ip;
            }
        }
        return request.getRemoteAddr();
    }

    private static String safeTrim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    @GetMapping("/permissions")
    public Result<?> getPermissionsByRole(@RequestParam(required = false) Long roleId) {
        return Result.success(userOrchestrator.permissionsByRole(roleId));
    }

    /**
     * 获取待审批用户列表
     *
     * @param page     当前页码
     * @param pageSize 每页条数
     * @return 待审批用户列表
     */
    @GetMapping("/pending")
    public Result<?> getPendingUsers(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize) {
        Page<User> userPage = userOrchestrator.listPendingUsers(page, pageSize);
        return Result.success(userPage);
    }

    /**
     * 统一的用户审批操作端点（替代2个分散端点）
     *
     * @param id     用户ID
     * @param action 操作类型：approve/reject
     * @param body   审批信息（包含remark）
     * @return 操作结果
     */
    @PostMapping("/{id}/approval-action")
    public Result<?> approvalAction(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestBody(required = false) User body) {

        String remark = body == null ? null : body.getApprovalRemark();
        if (remark == null) {
            remark = body == null ? null : body.getOperationRemark();
        }

        // 智能路由到对应的Orchestrator方法
        switch (action.toLowerCase()) {
            case "approve":
                userOrchestrator.approveUser(id, remark);
                return Result.successMessage("用户已批准");
            case "reject":
                userOrchestrator.rejectUser(id, remark);
                return Result.successMessage("用户已拒绝");
            default:
                return Result.fail("不支持的操作: " + action);
        }
    }

    /**
     * 个人修改密码（登录用户本人操作）
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/me/change-password")
    public Result<?> changePassword(@RequestBody java.util.Map<String, String> body) {
        String oldPassword = safeTrim(body.get("oldPassword"));
        String newPassword = safeTrim(body.get("newPassword"));
        if (oldPassword == null || newPassword == null) {
            return Result.fail("旧密码和新密码不能为空");
        }
        if (newPassword.length() < 6) {
            return Result.fail("新密码不能少于6个字符");
        }
        userOrchestrator.changePassword(oldPassword, newPassword);
        return Result.successMessage("密码修改成功");
    }

    /**
     * 超级管理员重置组户主账号密码
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/reset-tenant-owner-password")
    public Result<?> resetTenantOwnerPassword(@RequestBody java.util.Map<String, Object> body) {
        Long tenantId = body.get("tenantId") != null ? Long.valueOf(String.valueOf(body.get("tenantId"))) : null;
        String newPassword = safeTrim(String.valueOf(body.getOrDefault("newPassword", "")));
        if (tenantId == null) {
            return Result.fail("租户ID不能为空");
        }
        if (newPassword == null || newPassword.length() < 6) {
            return Result.fail("新密码不能少于6个字符");
        }
        userOrchestrator.resetTenantOwnerPassword(tenantId, newPassword);
        return Result.successMessage("密码重置成功");
    }
}
