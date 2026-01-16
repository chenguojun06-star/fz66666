package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.UserOrchestrator;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 用户控制器
 */
@RestController
@RequestMapping("/api/system/user")
public class UserController {

    @Autowired
    private UserOrchestrator userOrchestrator;

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

    @GetMapping("/me")
    public Result<?> me() {
        return Result.success(userOrchestrator.me());
    }

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
    public Result<?> deleteUser(@PathVariable Long id) {
        userOrchestrator.delete(id);
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
    public Result<?> toggleStatus(@RequestParam Long id, @RequestParam String status) {
        userOrchestrator.toggleStatus(id, status);
        return Result.successMessage("状态切换成功");
    }

    /**
     * 用户登录
     * 
     * @param loginData 登录信息
     * @return 登录结果
     */
    @PostMapping("/login")
    public Result<?> login(@RequestBody User loginData, HttpServletRequest request) {
        String username = loginData == null ? null : loginData.getUsername();
        String ip = resolveClientIp(request);
        userOrchestrator.assertLoginAllowed(safeTrim(username), safeTrim(ip));
        try {
            Object payloadObj = userOrchestrator.loginWithToken(loginData);
            User user = null;
            if (payloadObj instanceof java.util.Map) {
                Object u = ((java.util.Map<?, ?>) payloadObj).get("user");
                if (u instanceof User) {
                    user = (User) u;
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
}
