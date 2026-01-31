package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.PermissionService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Locale;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import org.springframework.security.access.AccessDeniedException;

@Service
@Slf4j
public class UserOrchestrator {

    private static final long LOGIN_WINDOW_MS = Duration.ofMinutes(10).toMillis();
    private static final int LOGIN_MAX_FAILURES = 10;
    private static final long LOGIN_LOCK_MS = Duration.ofMinutes(15).toMillis();

    private final ConcurrentHashMap<String, LoginThrottle> loginThrottle = new ConcurrentHashMap<>();

    @Autowired
    private UserService userService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private AuthTokenService authTokenService;

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status) {
        Page<User> userPage = userService.getUserPage(page, pageSize, username, name, roleName, status);
        if (userPage != null && userPage.getRecords() != null) {
            userPage.getRecords().forEach(this::sanitizeUser);
        }
        return userPage;
    }

    public User getById(Long id) {
        User user = userService.getById(id);
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }
        sanitizeUser(user);
        return user;
    }

    public boolean add(User user) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = userService.saveUser(user);
        if (!success) {
            throw new IllegalStateException("新增失败");
        }
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), "CREATE", TextUtils.safeText(user == null ? null : user.getOperationRemark()));
        return true;
    }

    public boolean update(User user) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String remark = TextUtils.safeText(user == null ? null : user.getOperationRemark());
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = userService.updateUser(user);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), "UPDATE", remark);
        return true;
    }

    public boolean delete(Long id) {
        return delete(id, null);
    }

    public boolean delete(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = userService.deleteUser(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), "DELETE", normalized);
        return true;
    }

    public boolean toggleStatus(Long id, String status) {
        return toggleStatus(id, status, null);
    }

    public boolean toggleStatus(Long id, String status, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = userService.toggleUserStatus(id, status);
        if (!success) {
            throw new IllegalStateException("状态切换失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), "STATUS_UPDATE", normalized);
        return true;
    }

    public Map<String, Object> loginWithToken(User loginData) {
        String username = loginData == null ? null : safeTrim(loginData.getUsername());
        String password = loginData == null ? null : safeTrim(loginData.getPassword());
        User user = userService.login(username, password);
        if (user == null) {
            throw new IllegalStateException("用户名或密码错误");
        }

        // 检查审批状态
        String approvalStatus = user.getApprovalStatus();
        if (approvalStatus != null && !"approved".equals(approvalStatus)) {
            if ("pending".equals(approvalStatus)) {
                throw new IllegalStateException("您的账号正在审批中，请耐心等待管理员审核");
            } else if ("rejected".equals(approvalStatus)) {
                throw new IllegalStateException("您的账号已被拒绝，原因：" +
                    (user.getApprovalRemark() != null ? user.getApprovalRemark() : "管理员拒绝"));
            }
        }

        sanitizeUser(user);

        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId() == null ? null : String.valueOf(user.getId()));
        subject.setUsername(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        subject.setRoleId(user.getRoleId() == null ? null : String.valueOf(user.getRoleId()));
        subject.setRoleName(user.getRoleName());
        // 设置数据权限范围，默认为 all
        subject.setPermissionRange(StringUtils.hasText(user.getPermissionRange()) ? user.getPermissionRange() : "all");

        String token = authTokenService == null ? null : authTokenService.issueToken(subject, Duration.ofHours(12));
        if (!StringUtils.hasText(token)) {
            throw new IllegalStateException("生成登录令牌失败");
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("token", token);
        payload.put("user", user);
        return payload;
    }

    public void assertLoginAllowed(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) {
            return;
        }
        LoginThrottle t = loginThrottle.computeIfAbsent(key, k -> new LoginThrottle());
        long now = System.currentTimeMillis();
        long lockedUntil = t.getLockedUntil(now);
        if (lockedUntil > now) {
            throw new IllegalStateException("登录失败次数过多，请稍后再试");
        }
    }

    public void onLoginFailed(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) {
            return;
        }
        LoginThrottle t = loginThrottle.computeIfAbsent(key, k -> new LoginThrottle());
        long now = System.currentTimeMillis();
        t.recordFailure(now);
        if (t.shouldLock(now)) {
            t.lock(now + LOGIN_LOCK_MS);
        }
    }

    public void onLoginSuccess(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) {
            return;
        }
        loginThrottle.remove(key);
    }

    public Map<String, Object> me() {
        User user = resolveCurrentUser();
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }
        sanitizeUser(user);

        // 构建返回对象，包含用户信息和权限列表
        Map<String, Object> result = new HashMap<>();
        result.put("id", user.getId());
        result.put("username", user.getUsername());
        result.put("name", user.getName());
        result.put("roleId", user.getRoleId());
        result.put("roleName", user.getRoleName());
        result.put("permissionRange", user.getPermissionRange());
        result.put("phone", user.getPhone());
        result.put("email", user.getEmail());

        List<String> permissions;
        try {
            permissions = getPermissionCodesByRoleId(user.getRoleId());
        } catch (Exception e) {
            permissions = List.of();
        }
        result.put("permissions", permissions);

        return result;
    }

    public User updateMe(User patch) {
        User current = resolveCurrentUser();
        if (current == null) {
            throw new NoSuchElementException("用户不存在");
        }

        String name = patch == null ? null : safeTrim(patch.getName());
        String phone = patch == null ? null : safeTrim(patch.getPhone());
        String email = patch == null ? null : safeTrim(patch.getEmail());

        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("姓名不能为空");
        }

        current.setName(name);
        current.setPhone(phone);
        current.setEmail(email);

        boolean success = userService.updateById(current);
        if (!success) {
            throw new IllegalStateException("保存失败");
        }
        sanitizeUser(current);
        return current;
    }

    public void recordLoginAttempt(String username, String name, String ip, String userAgent, String status,
            String message) {
        try {
            LoginLog log = new LoginLog();
            log.setLogType("LOGIN"); // 设置日志类型为登录
            log.setUsername(safeTrim(username));
            log.setName(safeTrim(name));
            log.setIp(safeTrim(ip));
            log.setLoginTime(LocalDateTime.now());
            log.setLoginStatus(safeTrim(status));
            log.setMessage(safeTrim(message));
            log.setUserAgent(safeTrim(userAgent));
            if (log.getUsername() != null && !log.getUsername().isBlank()) {
                loginLogService.save(log);
            }
        } catch (Exception e) {
            log.warn("Failed to record login attempt: username={}, ip={}, status={}", username, ip, status, e);
        }
    }

    /**
     * 获取待审批用户列表
     */
    public Page<User> listPendingUsers(Long page, Long pageSize) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        QueryWrapper<User> wrapper = new QueryWrapper<>();
        wrapper.eq("approval_status", "pending")
               .or()
               .isNull("approval_status");
        wrapper.orderByDesc("create_time");

        Page<User> userPage = userService.page(new Page<>(page, pageSize), wrapper);
        if (userPage != null && userPage.getRecords() != null) {
            userPage.getRecords().forEach(this::sanitizeUser);
        }
        return userPage;
    }

    /**
     * 批准用户
     */
    public boolean approveUser(Long id) {
        return approveUser(id, null);
    }

    public boolean approveUser(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        User user = userService.getById(id);
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }

        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }

        user.setApprovalStatus("approved");
        user.setApprovalTime(LocalDateTime.now());
        user.setApprovalRemark(normalized);
        user.setStatus("active"); // 同时激活用户

        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("批准失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), "APPROVE", normalized);
        return true;
    }

    /**
     * 拒绝用户
     */
    public boolean rejectUser(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        User user = userService.getById(id);
        if (user == null) {
            throw new NoSuchElementException("用户不存在");
        }

        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }

        user.setApprovalStatus("rejected");
        user.setApprovalTime(LocalDateTime.now());
        user.setApprovalRemark(normalized);
        user.setStatus("inactive"); // 同时停用用户

        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("拒绝失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), "REJECT", normalized);
        return true;
    }

    public List<String> permissionsByRole(Long roleId) {
        Long rid = roleId;
        if (!UserContext.isTopAdmin()) {
            User current = resolveCurrentUser();
            if (current == null || current.getRoleId() == null) {
                throw new AccessDeniedException("无权限操作");
            }
            rid = current.getRoleId();
        }
        return getPermissionCodesByRoleId(rid);
    }

    /**
     * 内部方法：根据角色ID获取权限代码列表（不做权限检查）
     */
    private List<String> getPermissionCodesByRoleId(Long roleId) {
        if (roleId == null) {
            return List.of();
        }

        List<Long> ids = rolePermissionService.getPermissionIdsByRoleId(roleId);
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return permissionService.listByIds(ids).stream()
                .map(p -> p.getPermissionCode())
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    private void sanitizeUser(User user) {
        if (user == null) {
            return;
        }
        user.setPassword(null);
    }

    private User resolveCurrentUser() {
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : safeTrim(ctx.getUserId());
        String username = ctx == null ? null : safeTrim(ctx.getUsername());

        User byId = null;
        if (StringUtils.hasText(userId)) {
            try {
                Long id = Long.valueOf(userId);
                byId = userService.getById(id);
            } catch (Exception e) {
                log.warn("Failed to resolve current user by userId from context: userId={}", userId, e);
            }
        }
        if (byId != null) {
            return byId;
        }

        if (!StringUtils.hasText(username)) {
            return null;
        }

        QueryWrapper<User> q = new QueryWrapper<>();
        q.eq("username", username);
        return userService.getOne(q, false);
    }

    private static String safeTrim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    // 使用TextUtils.safeText()替代

    private void saveOperationLog(String bizType, String bizId, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, action, operator, remark);
        } catch (Exception e) {
        }
    }

    private static String loginThrottleKey(String username, String ip) {
        String u = safeTrim(username);
        String i = safeTrim(ip);
        if (!StringUtils.hasText(u) || !StringUtils.hasText(i)) {
            return null;
        }
        return u.toLowerCase(Locale.ROOT) + "|" + i;
    }

    private static final class LoginThrottle {
        private long windowStartMs;
        private int failures;
        private long lockedUntilMs;

        private synchronized long getLockedUntil(long now) {
            if (lockedUntilMs > now) {
                return lockedUntilMs;
            }
            if (lockedUntilMs != 0 && lockedUntilMs <= now) {
                lockedUntilMs = 0;
            }
            return lockedUntilMs;
        }

        private synchronized void recordFailure(long now) {
            if (windowStartMs == 0 || now - windowStartMs > LOGIN_WINDOW_MS) {
                windowStartMs = now;
                failures = 0;
            }
            failures++;
        }

        private synchronized boolean shouldLock(long now) {
            if (windowStartMs == 0 || now - windowStartMs > LOGIN_WINDOW_MS) {
                windowStartMs = now;
                failures = 0;
                return false;
            }
            return failures >= LOGIN_MAX_FAILURES;
        }

        private synchronized void lock(long until) {
            lockedUntilMs = Math.max(lockedUntilMs, until);
        }
    }
}
