package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class UserLoginHelper {

    private static final String PWD_VER_KEY_PREFIX = "pwd:ver:";
    private static final int LOGIN_MAX_FAILURES = 10;
    private static final long LOGIN_LOCK_SECONDS = Duration.ofMinutes(15).getSeconds();
    private static final long LOGIN_WINDOW_SECONDS = Duration.ofMinutes(10).getSeconds();
    private static final String REDIS_LOGIN_FAIL_PREFIX = "fashion:ratelimit:login:fail:";
    private static final String REDIS_LOGIN_LOCK_PREFIX = "fashion:ratelimit:login:lock:";

    @Autowired
    private UserService userService;
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
    @Autowired
    private SmsLoginHelper smsLoginHelper;

    public Map<String, Object> loginWithToken(User loginData) {
        String username = loginData == null ? null : safeTrim(loginData.getUsername());
        String password = loginData == null ? null : safeTrim(loginData.getPassword());
        Long tenantId = loginData == null ? null : loginData.getTenantId();
        User user = userService.login(username, password, tenantId);
        if (user == null) {
            throw new IllegalStateException("用户名或密码错误");
        }
        return buildLoginPayload(user, "PC登录");
    }

    public Map<String, Object> sendLoginSmsCode(String phone, Long tenantId) {
        String normalizedPhone = smsLoginHelper.normalizePhone(phone);
        smsLoginHelper.validatePhone(normalizedPhone);
        User user = userService.findLoginUserByPhone(normalizedPhone, tenantId);
        if (user == null) {
            throw new IllegalStateException("该手机号未绑定可登录账号");
        }
        assertApprovalStatus(user);
        smsLoginHelper.assertSmsLoginCodeCanSend(normalizedPhone, tenantId);
        String code = smsLoginHelper.generateSmsCode();
        try {
            smsLoginHelper.dispatchSmsLoginCode(normalizedPhone, code);
            smsLoginHelper.saveSmsLoginCode(normalizedPhone, tenantId, code);
        } catch (RuntimeException e) {
            smsLoginHelper.clearSmsLoginCode(normalizedPhone, tenantId);
            throw e;
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("expiresInSeconds", smsLoginHelper.getCodeTtlSeconds());
        payload.put("cooldownSeconds", smsLoginHelper.getSendIntervalSeconds());
        payload.put("gatewayConfigured", smsLoginHelper.isGatewayConfigured());
        return payload;
    }

    public Map<String, Object> loginWithPhoneCode(String phone, String code, Long tenantId) {
        String normalizedPhone = smsLoginHelper.normalizePhone(phone);
        String normalizedCode = safeTrim(code);
        smsLoginHelper.validatePhone(normalizedPhone);
        if (!StringUtils.hasText(normalizedCode)) {
            throw new IllegalStateException("请输入验证码");
        }
        User user = userService.findLoginUserByPhone(normalizedPhone, tenantId);
        if (user == null || !smsLoginHelper.verifySmsLoginCode(normalizedPhone, tenantId, normalizedCode)) {
            throw new IllegalStateException("手机号或验证码错误");
        }
        smsLoginHelper.clearSmsLoginCode(normalizedPhone, tenantId);
        return buildLoginPayload(user, "手机号验证码登录");
    }

    public void assertLoginAllowed(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) return;
        try {
            String lockKey = REDIS_LOGIN_LOCK_PREFIX + key;
            if (stringRedisTemplate != null && Boolean.TRUE.equals(stringRedisTemplate.hasKey(lockKey))) {
                throw new IllegalStateException("登录失败次数过多，请稍后再试");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[LoginThrottle] Redis检查异常，放行登录: {}", e.getMessage());
        }
    }

    public void onLoginFailed(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) return;
        try {
            if (stringRedisTemplate == null) return;
            String failKey = REDIS_LOGIN_FAIL_PREFIX + key;
            Long count = stringRedisTemplate.opsForValue().increment(failKey);
            if (count != null && count == 1) {
                stringRedisTemplate.expire(failKey, LOGIN_WINDOW_SECONDS, TimeUnit.SECONDS);
            }
            if (count != null && count >= LOGIN_MAX_FAILURES) {
                String lockKey = REDIS_LOGIN_LOCK_PREFIX + key;
                stringRedisTemplate.opsForValue().set(lockKey, String.valueOf(count), LOGIN_LOCK_SECONDS, TimeUnit.SECONDS);
                stringRedisTemplate.delete(failKey);
                log.warn("[LoginThrottle] 账号锁定: key={}, 失败次数={}", key, count);
            }
        } catch (Exception e) {
            log.warn("[LoginThrottle] Redis记录失败异常: {}", e.getMessage());
        }
    }

    public void onLoginSuccess(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) return;
        try {
            if (stringRedisTemplate == null) return;
            stringRedisTemplate.delete(REDIS_LOGIN_FAIL_PREFIX + key);
            stringRedisTemplate.delete(REDIS_LOGIN_LOCK_PREFIX + key);
        } catch (Exception e) {
            log.warn("[LoginThrottle] Redis清除失败计数异常: {}", e.getMessage());
        }
    }

    public void recordLoginAttempt(String username, String name, String ip, String userAgent, String status, String message) {
        try {
            LoginLog loginLog = new LoginLog();
            loginLog.setLogType("LOGIN");
            loginLog.setUsername(safeTrim(username));
            loginLog.setName(safeTrim(name));
            loginLog.setIp(StringUtils.hasText(ip) ? ip.trim() : "0.0.0.0");
            loginLog.setLoginTime(LocalDateTime.now());
            loginLog.setLoginStatus(StringUtils.hasText(status) ? status.trim() : "UNKNOWN");
            loginLog.setMessage(safeTrim(message));
            loginLog.setUserAgent(safeTrim(userAgent));
            Long tenantId = UserContext.tenantId();
            if (tenantId == null && StringUtils.hasText(username)) {
                try {
                    User found = userService.getOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                            .eq(User::getUsername, safeTrim(username)).last("LIMIT 1"), false);
                    if (found != null) tenantId = found.getTenantId();
                } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            }
            loginLog.setTenantId(tenantId);
            if (loginLog.getUsername() != null && !loginLog.getUsername().isBlank()) {
                loginLogService.save(loginLog);
            }
            if ("SUCCESS".equalsIgnoreCase(status) && StringUtils.hasText(username)) {
                try {
                    User found = userService.getOne(
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                            .eq(User::getUsername, safeTrim(username))
                            .last("LIMIT 1"), false);
                    if (found != null) {
                        User update = new User();
                        update.setId(found.getId());
                        update.setLastLoginTime(loginLog.getLoginTime());
                        update.setLastLoginIp(safeTrim(ip));
                        userService.updateById(update);
                    }
                } catch (Exception ex) {
                    log.warn("[登录] 更新最后登录时间/IP失败: username={}", username, ex);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to record login attempt: username={}, ip={}, status={}", username, ip, status, e);
        }
    }

    public void incrementPwdVersion(Long userId) {
        if (stringRedisTemplate != null && userId != null) {
            try {
                stringRedisTemplate.opsForValue().increment(PWD_VER_KEY_PREFIX + userId);
            } catch (Exception e) {
                log.warn("[密码版本] 更新失败（Redis 不可用），旧 token 不会立即失效 userId={}", userId);
            }
        }
    }

    private Map<String, Object> buildLoginPayload(User user, String scene) {
        assertApprovalStatus(user);
        sanitizeUser(user);
        if (user.getTenantId() != null && tenantService != null) {
            Tenant tenant = tenantService.getById(user.getTenantId());
            if (tenant != null && StringUtils.hasText(tenant.getTenantName())) {
                user.setTenantName(tenant.getTenantName());
            }
        }
        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId() == null ? null : String.valueOf(user.getId()));
        subject.setUsername(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        subject.setRoleId(user.getRoleId() == null ? null : String.valueOf(user.getRoleId()));
        subject.setRoleName(user.getRoleName());
        String permRange = user.getPermissionRange();
        if (!StringUtils.hasText(permRange)) {
            if (Boolean.TRUE.equals(user.getIsTenantOwner()) || isAdminRole(user.getRoleName()) || !StringUtils.hasText(user.getFactoryId())) {
                permRange = "all";
            } else {
                permRange = "own";
            }
        }
        if (Boolean.TRUE.equals(user.getIsTenantOwner()) || isAdminRole(user.getRoleName())) {
            if (!"all".equals(permRange)) {
                log.warn("[{}] 租户主/管理员权限范围异常 userId={}, dbPermRange={}, 强制覆盖为 all", scene, user.getId(), permRange);
                permRange = "all";
                persistPermissionRangeIfNeeded(user, permRange, scene);
            }
        }
        subject.setPermissionRange(permRange);
        if (StringUtils.hasText(user.getFactoryId())) {
            subject.setFactoryId(user.getFactoryId());
        }
        subject.setTenantId(user.getTenantId());
        subject.setTenantOwner(Boolean.TRUE.equals(user.getIsTenantOwner()));
        subject.setSuperAdmin(Boolean.TRUE.equals(user.getIsSuperAdmin()));
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
        String token = authTokenService == null ? null : authTokenService.issueToken(subject, null);
        String refreshToken = authTokenService == null ? null : authTokenService.issueRefreshToken(subject);
        if (!StringUtils.hasText(token)) {
            throw new IllegalStateException("生成登录令牌失败");
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("token", token);
        payload.put("refreshToken", refreshToken);
        payload.put("tokenTtlHours", authTokenService != null ? authTokenService.getJwtTtlHours() : 4);
        payload.put("user", user);
        return payload;
    }

    private void assertApprovalStatus(User user) {
        if (user == null) throw new IllegalStateException("账号不存在");
        String approvalStatus = safeTrim(user.getApprovalStatus());
        if (!StringUtils.hasText(approvalStatus) || "approved".equalsIgnoreCase(approvalStatus)) return;
        if ("pending".equalsIgnoreCase(approvalStatus)) throw new IllegalStateException("您的账号正在审批中，请耐心等待管理员审核");
        if ("rejected".equalsIgnoreCase(approvalStatus)) throw new IllegalStateException("您的账号已被拒绝，原因：" + (user.getApprovalRemark() != null ? user.getApprovalRemark() : "管理员拒绝"));
        throw new IllegalStateException("账号状态异常，请联系管理员");
    }

    private void persistPermissionRangeIfNeeded(User user, String targetPermRange, String scene) {
        if (user == null || user.getId() == null || !StringUtils.hasText(targetPermRange)) return;
        try {
            User patch = new User();
            patch.setId(user.getId());
            patch.setPermissionRange(targetPermRange);
            if (userService.updateById(patch)) {
                user.setPermissionRange(targetPermRange);
                log.info("[{}] 已自动修复用户权限范围 userId={} -> {}", scene, user.getId(), targetPermRange);
            }
        } catch (Exception e) {
            log.warn("[{}] 自动修复用户权限范围失败 userId={} err={}", scene, user.getId(), e.getMessage());
        }
    }

    private void sanitizeUser(User user) { if (user != null) user.setPassword(null); }

    private static String safeTrim(String s) { if (s == null) return null; String t = s.trim(); return t.isEmpty() ? null : t; }

    private static String loginThrottleKey(String username, String ip) {
        String u = safeTrim(username); String i = safeTrim(ip);
        if (!StringUtils.hasText(u) || !StringUtils.hasText(i)) return null;
        return u.toLowerCase(Locale.ROOT) + "|" + i;
    }

    private static boolean isAdminRole(String roleName) {
        if (!StringUtils.hasText(roleName)) return false;
        String r = roleName.trim().toLowerCase();
        return "1".equals(roleName.trim()) || r.contains("admin") || r.contains("管理员") || r.contains("管理");
    }
}
