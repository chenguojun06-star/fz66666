package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Locale;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.security.access.AccessDeniedException;

@Service
@Slf4j
public class UserOrchestrator {

    /** Redis key 前缀：pwd:ver:{userId}，用于改密后废止旧令牌 */
    private static final String PWD_VER_KEY_PREFIX = "pwd:ver:";

    private static final long LOGIN_WINDOW_MS = Duration.ofMinutes(10).toMillis();
    private static final int LOGIN_MAX_FAILURES = 10;
    private static final long LOGIN_LOCK_MS = Duration.ofMinutes(15).toMillis();

    private final ConcurrentHashMap<String, LoginThrottle> loginThrottle = new ConcurrentHashMap<>();

    @Autowired
    private UserService userService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private AuthTokenService authTokenService;

    @Autowired
    private PermissionCalculationEngine permissionEngine;

    @Autowired(required = false)
    private TenantService tenantService;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status) {
        Long tenantId = UserContext.tenantId();
        Page<User> userPage;
        if (tenantId != null) {
            // 🔐 租户用户：显式过滤，双重保障（TenantInterceptor + 应用层）
            QueryWrapper<User> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId);
            if (StringUtils.hasText(username)) query.like("username", username);
            if (StringUtils.hasText(name)) query.like("name", name);
            if (StringUtils.hasText(roleName)) query.like("role_name", roleName);
            if (StringUtils.hasText(status)) query.eq("status", status);
            userPage = userService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 10), query);
        } else {
            // 超级管理员：无租户过滤
            userPage = userService.getUserPage(page, pageSize, username, name, roleName, status);
        }
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
        // 🔐 租户隔离检查：防止越权查看其他租户用户
        Long tenantId = UserContext.tenantId();
        if (tenantId != null && !tenantId.equals(user.getTenantId())) {
            throw new AccessDeniedException("无权查看其他租户的用户");
        }
        sanitizeUser(user);
        return user;
    }

    public boolean add(User user) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        // 在 Orchestrator 层处理角色同步逻辑（避免 Service 互调）
        if (user.getRoleId() != null) {
            Role role = roleService.getById(user.getRoleId());
            if (role != null) {
                user.setRoleName(role.getRoleName());
                String dataScope = role.getDataScope();
                if ("all".equals(dataScope)) {
                    user.setPermissionRange("all");
                } else {
                    user.setPermissionRange("self");
                }
            }
        }
        boolean success = userService.saveUser(user);
        if (!success) {
            throw new IllegalStateException("新增失败");
        }
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), user == null ? null : user.getUsername(), "CREATE", TextUtils.safeText(user == null ? null : user.getOperationRemark()));
        return true;
    }

    public boolean update(User user) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (user == null) {
            throw new IllegalArgumentException("用户信息不能为空");
        }
        String remark = TextUtils.safeText(user.getOperationRemark());
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        // 在 Orchestrator 层处理角色同步逻辑（避免 Service 互调）
        if (user.getRoleId() != null) {
            Role role = roleService.getById(user.getRoleId());
            if (role != null) {
                user.setRoleName(role.getRoleName());
                String dataScope = role.getDataScope();
                if ("all".equals(dataScope)) {
                    user.setPermissionRange("all");
                } else {
                    user.setPermissionRange("self");
                }
            }
        }
        boolean success = userService.updateUser(user);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        saveOperationLog("user", user == null ? null : String.valueOf(user.getId()), user == null ? null : user.getUsername(), "UPDATE", remark);
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
        // 删除前先将用户名存下来用于日志
        User toDelete = userService.getById(id);
        String deletedUsername = toDelete != null ? toDelete.getUsername() : null;
        boolean success = userService.deleteUser(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), deletedUsername, "DELETE", normalized);
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
        saveOperationLog("user", id == null ? null : String.valueOf(id), null, "STATUS_UPDATE", normalized);
        return true;
    }

    public Map<String, Object> loginWithToken(User loginData) {
        String username = loginData == null ? null : safeTrim(loginData.getUsername());
        String password = loginData == null ? null : safeTrim(loginData.getPassword());
        Long tenantId = loginData == null ? null : loginData.getTenantId();
        User user = userService.login(username, password, tenantId);
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

        // 注入租户名称（非数据库字段，登录时主动赋就供前端个性化显示）
        if (user.getTenantId() != null && tenantService != null) {
            Tenant tenant = tenantService.getById(user.getTenantId());
            if (tenant != null && StringUtils.hasText(tenant.getTenantName())) {
                user.setTenantName(tenant.getTenantName());
            }
        }

        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId() == null ? null : String.valueOf(user.getId()));
        // 统一逻辑：优先存真实姓名（name），没有才存登录账号（username）
        // 与小程序端保持一致，使 creator_name/operator_name 显示真实姓名
        subject.setUsername(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        subject.setRoleId(user.getRoleId() == null ? null : String.valueOf(user.getRoleId()));
        subject.setRoleName(user.getRoleName());
        // 设置数据权限范围
        // 安全修复：未设置时管理员/租户主默认"all"，普通员工默认"own"（防止旧账户越权）
        String permRange = user.getPermissionRange();
        if (!StringUtils.hasText(permRange)) {
            if (Boolean.TRUE.equals(user.getIsTenantOwner()) || isAdminRole(user.getRoleName())) {
                permRange = "all";
            } else {
                permRange = "own";
            }
        }
        subject.setPermissionRange(permRange);
        // 设置租户信息
        subject.setTenantId(user.getTenantId());
        subject.setTenantOwner(Boolean.TRUE.equals(user.getIsTenantOwner()));
        subject.setSuperAdmin(Boolean.TRUE.equals(user.getIsSuperAdmin()));
        // 读取当前密码版本号，嵌入 JWT（尤如改密则旧令牌失效）
        long pwdVersion = 0L;
        if (stringRedisTemplate != null && user.getId() != null) {
            try {
                String v = stringRedisTemplate.opsForValue().get(PWD_VER_KEY_PREFIX + user.getId());
                if (v != null) pwdVersion = Long.parseLong(v);
            } catch (Exception e) {
                log.debug("[登录] 读取 pwdVersion 失败（Redis 不可用），使用默认值 0");
            }
        }
        subject.setPwdVersion(pwdVersion);

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
        result.put("tenantId", user.getTenantId());
        result.put("isTenantOwner", Boolean.TRUE.equals(user.getIsTenantOwner()));
        result.put("isSuperAdmin", Boolean.TRUE.equals(user.getIsSuperAdmin()));
        // 补充 tenantName，从数据库实时查询（保证修改租户名后立即生效）
        if (user.getTenantId() != null && tenantService != null) {
            try {
                Tenant currentTenant = tenantService.getById(user.getTenantId());
                if (currentTenant != null && StringUtils.hasText(currentTenant.getTenantName())) {
                    result.put("tenantName", currentTenant.getTenantName());
                }
            } catch (Exception ignored) {
                // 查询租户名失败不影响主流程
            }
        }

        List<String> permissions;
        try {
            permissions = permissionEngine.calculatePermissions(
                    user.getId(), user.getRoleId(), user.getTenantId(),
                    Boolean.TRUE.equals(user.getIsTenantOwner()));
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

        // 个人中心允许修改手机号和头像URL，其他字段（姓名/邮箱等）需管理员通过人员管理页面操作
        String phone = patch == null ? null : safeTrim(patch.getPhone());
        current.setPhone(phone);

        // 头像URL：非空时才更新（允许只传手机号不传头像）
        if (patch != null && patch.getAvatarUrl() != null && !patch.getAvatarUrl().isBlank()) {
            current.setAvatarUrl(patch.getAvatarUrl().trim());
        }

        boolean success = userService.updateById(current);
        if (!success) {
            throw new IllegalStateException("保存失败");
        }
        sanitizeUser(current);
        return current;
    }

    /** 个人修改密码（需验证旧密码） */
    public void changePassword(String oldPassword, String newPassword) {
        User current = resolveCurrentUser();
        if (current == null) {
            throw new NoSuchElementException("用户不存在");
        }
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        if (!encoder.matches(oldPassword, current.getPassword())) {
            throw new IllegalArgumentException("原密码错误");
        }
        current.setPassword(encoder.encode(newPassword));
        userService.updateById(current);
        // 递增密码版本号，强制全部旧 token 失效
        if (stringRedisTemplate != null && current.getId() != null) {
            try {
                stringRedisTemplate.opsForValue().increment(PWD_VER_KEY_PREFIX + current.getId());
            } catch (Exception e) {
                log.warn("[改密] 更新密码版本号失败（Redis 不可用），旧 token 不会立即失效 userId={}", current.getId());
            }
        }
        saveOperationLog("user", String.valueOf(current.getId()), current.getUsername(), "CHANGE_PASSWORD", "用户修改密码");
    }

    /** 超管重置某租户主账号密码（无需验证旧密码） */
    public void resetTenantOwnerPassword(Long tenantId, String newPassword) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("仅超管可重置租户密码");
        }
        QueryWrapper<User> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId).eq("is_tenant_owner", true).last("LIMIT 1");
        User owner = userService.getOne(q, false);
        if (owner == null) {
            throw new NoSuchElementException("未找到该租户主账号");
        }
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        owner.setPassword(encoder.encode(newPassword));
        userService.updateById(owner);
        // 递增密码版本号，强制旧 token 失效
        if (stringRedisTemplate != null && owner.getId() != null) {
            try {
                stringRedisTemplate.opsForValue().increment(PWD_VER_KEY_PREFIX + owner.getId());
            } catch (Exception e) {
                log.warn("[超管重置密码] 更新密码版本号失败（Redis 不可用），旧 token 不会立即失效 userId={}", owner.getId());
            }
        }
        saveOperationLog("user", String.valueOf(owner.getId()), owner.getUsername(), "RESET_PASSWORD",
                "超管重置租户主账号密码: tenantId=" + tenantId);
    }

    public void recordLoginAttempt(String username, String name, String ip, String userAgent, String status,
            String message) {
        try {
            LoginLog loginLog = new LoginLog();
            loginLog.setLogType("LOGIN"); // 设置日志类型为登录
            loginLog.setUsername(safeTrim(username));
            loginLog.setName(safeTrim(name));
            loginLog.setIp(safeTrim(ip));
            loginLog.setLoginTime(LocalDateTime.now());
            loginLog.setLoginStatus(safeTrim(status));
            loginLog.setMessage(safeTrim(message));
            loginLog.setUserAgent(safeTrim(userAgent));
            // 解析租户ID：从UserContext或通过用户名查找
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            if (tenantId == null && StringUtils.hasText(username)) {
                try {
                    User found = userService.getOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                            .eq(User::getUsername, safeTrim(username)).last("LIMIT 1"), false);
                    if (found != null) tenantId = found.getTenantId();
                } catch (Exception ignored) { }
            }
            loginLog.setTenantId(tenantId);
            if (loginLog.getUsername() != null && !loginLog.getUsername().isBlank()) {
                loginLogService.save(loginLog);
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
        wrapper.and(w -> w
               .eq("approval_status", "pending")
               .or()
               .isNull("approval_status")
               .or()
               .eq("registration_status", "PENDING")
        );
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
        // 同步更新 registrationStatus（兼容小程序注册流程）
        if ("PENDING".equals(user.getRegistrationStatus())) {
            user.setRegistrationStatus("ACTIVE");
        }

        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("批准失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), user.getUsername(), "APPROVE", normalized);
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
        // 同步更新 registrationStatus（兼容小程序注册流程）
        if ("PENDING".equals(user.getRegistrationStatus())) {
            user.setRegistrationStatus("REJECTED");
        }

        boolean success = userService.updateById(user);
        if (!success) {
            throw new IllegalStateException("拒绝失败");
        }
        saveOperationLog("user", id == null ? null : String.valueOf(id), user.getUsername(), "REJECT", normalized);
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
        // 使用权限计算引擎（支持三级权限）
        User user = resolveCurrentUser();
        if (user != null) {
            return permissionEngine.calculatePermissions(user.getId(), rid, user.getTenantId());
        }
        return permissionEngine.getRolePermissionCodes(rid);
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

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
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

    /**
     * 判断角色名称是否属于管理员角色
     * 用于在生成JWT时确定默认数据权限范围
     */
    private static boolean isAdminRole(String roleName) {
        if (!StringUtils.hasText(roleName)) {
            return false;
        }
        String r = roleName.trim().toLowerCase();
        return "1".equals(roleName.trim()) || r.contains("admin") || r.contains("管理员") || r.contains("管理");
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
