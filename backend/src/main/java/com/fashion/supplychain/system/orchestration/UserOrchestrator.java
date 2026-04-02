package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.integration.config.TencentSmsProperties;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import com.tencentcloudapi.common.Credential;
import com.tencentcloudapi.common.exception.TencentCloudSDKException;
import com.tencentcloudapi.common.profile.ClientProfile;
import com.tencentcloudapi.common.profile.HttpProfile;
import com.tencentcloudapi.sms.v20210111.SmsClient;
import com.tencentcloudapi.sms.v20210111.models.SendSmsRequest;
import com.tencentcloudapi.sms.v20210111.models.SendSmsResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class UserOrchestrator {

    /** Redis key 前缀：pwd:ver:{userId}，用于改密后废止旧令牌 */
    private static final String PWD_VER_KEY_PREFIX = "pwd:ver:";

    private static final int LOGIN_MAX_FAILURES = 10;
    private static final long LOGIN_LOCK_SECONDS = Duration.ofMinutes(15).getSeconds();
    private static final long LOGIN_WINDOW_SECONDS = Duration.ofMinutes(10).getSeconds();
    private static final String REDIS_LOGIN_FAIL_PREFIX = "fashion:ratelimit:login:fail:";
    private static final String REDIS_LOGIN_LOCK_PREFIX = "fashion:ratelimit:login:lock:";
    private static final String REDIS_SMS_LOGIN_CODE_PREFIX = "fashion:auth:sms-login:code:";
    private static final String REDIS_SMS_LOGIN_SEND_PREFIX = "fashion:auth:sms-login:send:";
    private static final String PHONE_PATTERN = "^1[3-9]\\d{9}$";

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

    @Autowired
    private TencentSmsProperties tencentSmsProperties;

    @org.springframework.beans.factory.annotation.Value("${app.auth.sms-login.code-ttl-seconds:300}")
    private long smsLoginCodeTtlSeconds;

    @org.springframework.beans.factory.annotation.Value("${app.auth.sms-login.send-interval-seconds:60}")
    private long smsLoginSendIntervalSeconds;

    @org.springframework.beans.factory.annotation.Value("${app.auth.sms-login.expose-code-in-response:false}")
    private boolean smsLoginExposeCodeInResponse;

    private final Map<String, ExpiringValue> smsLoginCodeFallbackStore = new ConcurrentHashMap<>();
    private final Map<String, ExpiringValue> smsLoginSendFallbackStore = new ConcurrentHashMap<>();

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status) {
        return list(page, pageSize, username, name, roleName, status, null);
    }

    public Page<User> list(Long page, Long pageSize, String username, String name, String roleName, String status, String factoryId) {
        Long tenantId = UserContext.tenantId();
        // 🔐 工厂账号安全守卫：只能看自己工厂的成员，忽略前端传入的 factoryId
        String currentUserFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentUserFactoryId)) {
            factoryId = currentUserFactoryId;
        }
        Page<User> userPage;
        if (tenantId != null) {
            // 🔐 租户用户：显式过滤，双重保障（TenantInterceptor + 应用层）
            QueryWrapper<User> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId);
            if (StringUtils.hasText(username)) query.like("username", username);
            if (StringUtils.hasText(name)) query.like("name", name);
            if (StringUtils.hasText(roleName)) query.like("role_name", roleName);
            if (StringUtils.hasText(status)) query.eq("status", status);
            if (StringUtils.hasText(factoryId)) query.eq("factory_id", factoryId);
            else query.isNull("factory_id");  // 内部人员管理只显示本厂内部账号，排除外发工厂账号
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
        String currentFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(currentFactoryId)) {
            // 工厂账号：只能切换自己工厂成员的状态（越权防护）
            User targetUser = userService.getById(id);
            if (targetUser == null) {
                throw new IllegalArgumentException("用户不存在");
            }
            if (!currentFactoryId.equals(targetUser.getFactoryId())) {
                throw new AccessDeniedException("只能操作本工厂的成员");
            }
        } else {
            // 租户管理员：需要顶级管理员权限 + 操作原因
            if (!UserContext.isTopAdmin()) {
                throw new AccessDeniedException("无权限操作");
            }
            String normalized = TextUtils.safeText(remark);
            if (!StringUtils.hasText(normalized)) {
                throw new IllegalArgumentException("操作原因不能为空");
            }
        }
        boolean success = userService.toggleUserStatus(id, status);
        if (!success) {
            throw new IllegalStateException("状态切换失败");
        }
        String logRemark = StringUtils.hasText(remark) ? TextUtils.safeText(remark)
                : (StringUtils.hasText(currentFactoryId) ? "工厂账号操作" : "");
        saveOperationLog("user", id == null ? null : String.valueOf(id), null, "STATUS_UPDATE", logRemark);
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
        return buildLoginPayload(user, "PC登录");
    }

    public Map<String, Object> sendLoginSmsCode(String phone, Long tenantId) {
        String normalizedPhone = normalizePhone(phone);
        validatePhone(normalizedPhone);
        User user = userService.findLoginUserByPhone(normalizedPhone, tenantId);
        if (user == null) {
            throw new IllegalStateException("该手机号未绑定可登录账号");
        }
        assertApprovalStatus(user);
        assertSmsLoginCodeCanSend(normalizedPhone, tenantId);
        String code = generateSmsCode();
        try {
            dispatchSmsLoginCode(normalizedPhone, code);
            saveSmsLoginCode(normalizedPhone, tenantId, code);
        } catch (RuntimeException e) {
            clearSmsLoginCode(normalizedPhone, tenantId);
            throw e;
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("expiresInSeconds", smsLoginCodeTtlSeconds);
        payload.put("cooldownSeconds", smsLoginSendIntervalSeconds);
        payload.put("gatewayConfigured", tencentSmsProperties != null && tencentSmsProperties.isConfigured());
        if (smsLoginExposeCodeInResponse) {
            payload.put("debugCode", code);
        }
        return payload;
    }

    public Map<String, Object> loginWithPhoneCode(String phone, String code, Long tenantId) {
        String normalizedPhone = normalizePhone(phone);
        String normalizedCode = safeTrim(code);
        validatePhone(normalizedPhone);
        if (!StringUtils.hasText(normalizedCode)) {
            throw new IllegalStateException("请输入验证码");
        }
        User user = userService.findLoginUserByPhone(normalizedPhone, tenantId);
        if (user == null || !verifySmsLoginCode(normalizedPhone, tenantId, normalizedCode)) {
            throw new IllegalStateException("手机号或验证码错误");
        }
        clearSmsLoginCode(normalizedPhone, tenantId);
        return buildLoginPayload(user, "手机号验证码登录");
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
            if (Boolean.TRUE.equals(user.getIsTenantOwner())
                    || isAdminRole(user.getRoleName())
                    || !StringUtils.hasText(user.getFactoryId())) {
                permRange = "all";
            } else {
                permRange = "own";
            }
        }
        if (Boolean.TRUE.equals(user.getIsTenantOwner()) || isAdminRole(user.getRoleName())) {
            if (!"all".equals(permRange)) {
                log.warn("[{}] 租户主/管理员权限范围异常 userId={}, dbPermRange={}, 强制覆盖为 all",
                        scene,
                        user.getId(), permRange);
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

        String token = authTokenService == null ? null : authTokenService.issueToken(subject, Duration.ofHours(12));
        if (!StringUtils.hasText(token)) {
            throw new IllegalStateException("生成登录令牌失败");
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("token", token);
        payload.put("user", user);
        return payload;
    }

    private void assertApprovalStatus(User user) {
        if (user == null) {
            throw new IllegalStateException("账号不存在");
        }
        String approvalStatus = safeTrim(user.getApprovalStatus());
        if (!StringUtils.hasText(approvalStatus) || "approved".equalsIgnoreCase(approvalStatus)) {
            return;
        }
        if ("pending".equalsIgnoreCase(approvalStatus)) {
            throw new IllegalStateException("您的账号正在审批中，请耐心等待管理员审核");
        }
        if ("rejected".equalsIgnoreCase(approvalStatus)) {
            throw new IllegalStateException("您的账号已被拒绝，原因：" +
                    (user.getApprovalRemark() != null ? user.getApprovalRemark() : "管理员拒绝"));
        }
        throw new IllegalStateException("账号状态异常，请联系管理员");
    }

    private void validatePhone(String phone) {
        if (!StringUtils.hasText(phone)) {
            throw new IllegalStateException("请输入手机号");
        }
        if (!phone.matches(PHONE_PATTERN)) {
            throw new IllegalStateException("请输入正确的手机号");
        }
    }

    private String normalizePhone(String phone) {
        return safeTrim(phone);
    }

    private void assertSmsLoginCodeCanSend(String phone, Long tenantId) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String redisKey = REDIS_SMS_LOGIN_SEND_PREFIX + cacheKey;
        if (stringRedisTemplate != null) {
            try {
                if (Boolean.TRUE.equals(stringRedisTemplate.hasKey(redisKey))) {
                    throw new IllegalStateException("验证码发送过于频繁，请稍后再试");
                }
                return;
            } catch (IllegalStateException e) {
                throw e;
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis发送频控检查失败，使用本地缓存: {}", e.getMessage());
            }
        }
        ExpiringValue localValue = smsLoginSendFallbackStore.get(cacheKey);
        if (localValue != null && !localValue.expired()) {
            throw new IllegalStateException("验证码发送过于频繁，请稍后再试");
        }
        smsLoginSendFallbackStore.remove(cacheKey);
    }

    private String generateSmsCode() {
        return String.format("%06d", ThreadLocalRandom.current().nextInt(100000, 1000000));
    }

    private void dispatchSmsLoginCode(String phone, String code) {
        if (tencentSmsProperties == null || !tencentSmsProperties.isConfigured()) {
            log.warn("[SmsLogin] 未配置腾讯云短信，验证码仅写入日志 phone={}, code={}", maskPhone(phone), code);
            return;
        }
        try {
            Credential credential = new Credential(
                    tencentSmsProperties.getSecretId().trim(),
                    tencentSmsProperties.getSecretKey().trim());
            HttpProfile httpProfile = new HttpProfile();
            httpProfile.setReqMethod("POST");
            httpProfile.setEndpoint(tencentSmsProperties.getEndpoint().trim());
            httpProfile.setConnTimeout(tencentSmsProperties.getConnectTimeoutSeconds());
            httpProfile.setReadTimeout(tencentSmsProperties.getReadTimeoutSeconds());
            httpProfile.setWriteTimeout(tencentSmsProperties.getWriteTimeoutSeconds());

            ClientProfile clientProfile = new ClientProfile();
            clientProfile.setSignMethod("TC3-HMAC-SHA256");
            clientProfile.setHttpProfile(httpProfile);

            SmsClient client = new SmsClient(credential, tencentSmsProperties.getRegion().trim(), clientProfile);
            SendSmsRequest request = new SendSmsRequest();
            request.setSmsSdkAppId(tencentSmsProperties.getSdkAppId().trim());
            request.setSignName(tencentSmsProperties.getSignName().trim());
            request.setTemplateId(tencentSmsProperties.getTemplateId().trim());
            request.setPhoneNumberSet(new String[] { toTencentPhoneNumber(phone) });
            request.setTemplateParamSet(new String[] { code });
            request.setSessionContext("pc-login:" + maskPhone(phone));

            SendSmsResponse response = client.SendSms(request);
            if (response == null || response.getSendStatusSet() == null || response.getSendStatusSet().length == 0) {
                throw new IllegalStateException("短信发送失败，请稍后重试");
            }
            String sendCode = safeTrim(response.getSendStatusSet()[0].getCode());
            if (!"Ok".equalsIgnoreCase(sendCode)) {
                String sendMessage = safeTrim(response.getSendStatusSet()[0].getMessage());
                log.error("[SmsLogin] 腾讯云短信发送失败 code={}, message={}, requestId={}",
                        sendCode, sendMessage, response.getRequestId());
                throw new IllegalStateException("短信发送失败，请稍后重试");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (TencentCloudSDKException e) {
            log.error("[SmsLogin] 腾讯云短信发送异常 phone={}, err={}", maskPhone(phone), e.getMessage(), e);
            throw new IllegalStateException("短信发送失败，请稍后重试");
        } catch (Exception e) {
            log.error("[SmsLogin] 短信发送异常 phone={}, err={}", maskPhone(phone), e.getMessage(), e);
            throw new IllegalStateException("短信发送失败，请稍后重试");
        }
    }

    private void saveSmsLoginCode(String phone, Long tenantId, String code) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String hashedCode = String.valueOf(hashSmsLoginCode(phone, tenantId, code));
        if (stringRedisTemplate != null) {
            try {
                stringRedisTemplate.opsForValue().set(
                        REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey,
                        hashedCode,
                        smsLoginCodeTtlSeconds,
                        TimeUnit.SECONDS);
                stringRedisTemplate.opsForValue().set(
                        REDIS_SMS_LOGIN_SEND_PREFIX + cacheKey,
                        "1",
                        smsLoginSendIntervalSeconds,
                        TimeUnit.SECONDS);
                return;
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis写入失败，使用本地缓存: {}", e.getMessage());
            }
        }
        long now = System.currentTimeMillis();
        smsLoginCodeFallbackStore.put(cacheKey, new ExpiringValue(hashedCode, now + smsLoginCodeTtlSeconds * 1000));
        smsLoginSendFallbackStore.put(cacheKey, new ExpiringValue("1", now + smsLoginSendIntervalSeconds * 1000));
    }

    private boolean verifySmsLoginCode(String phone, Long tenantId, String code) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        String expectedHash = hashSmsLoginCode(phone, tenantId, code);
        String storedHash = null;
        if (stringRedisTemplate != null) {
            try {
                storedHash = stringRedisTemplate.opsForValue().get(REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey);
            } catch (Exception e) {
                log.warn("[SmsLogin] Redis读取失败，使用本地缓存: {}", e.getMessage());
            }
        }
        if (!StringUtils.hasText(storedHash)) {
            ExpiringValue localValue = smsLoginCodeFallbackStore.get(cacheKey);
            if (localValue != null && !localValue.expired()) {
                storedHash = localValue.value();
            } else {
                smsLoginCodeFallbackStore.remove(cacheKey);
            }
        }
        if (!StringUtils.hasText(storedHash)) {
            return false;
        }
        String verifiedHash = storedHash;
        return MessageDigest.isEqual(
                verifiedHash.getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }

    private void clearSmsLoginCode(String phone, Long tenantId) {
        String cacheKey = smsLoginCacheKey(phone, tenantId);
        smsLoginCodeFallbackStore.remove(cacheKey);
        if (stringRedisTemplate == null) {
            return;
        }
        try {
            stringRedisTemplate.delete(REDIS_SMS_LOGIN_CODE_PREFIX + cacheKey);
        } catch (Exception e) {
            log.warn("[SmsLogin] Redis删除验证码失败: {}", e.getMessage());
        }
    }

    private String smsLoginCacheKey(String phone, Long tenantId) {
        return (tenantId == null ? "platform" : String.valueOf(tenantId)) + ":" + phone;
    }

    private String hashSmsLoginCode(String phone, Long tenantId, String code) {
        String raw = smsLoginCacheKey(phone, tenantId) + ":" + safeTrim(code);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("验证码处理失败");
        }
    }

    private String maskPhone(String phone) {
        String normalizedPhone = normalizePhone(phone);
        if (!StringUtils.hasText(normalizedPhone) || normalizedPhone.length() < 7) {
            return "******";
        }
        return normalizedPhone.substring(0, 3) + "****" + normalizedPhone.substring(normalizedPhone.length() - 4);
    }

    private String toTencentPhoneNumber(String phone) {
        String normalizedPhone = normalizePhone(phone);
        if (!StringUtils.hasText(normalizedPhone)) {
            return phone;
        }
        if (normalizedPhone.startsWith("+")) {
            return normalizedPhone;
        }
        return "+86" + normalizedPhone;
    }

    private void persistPermissionRangeIfNeeded(User user, String targetPermRange, String scene) {
        if (user == null || user.getId() == null || !StringUtils.hasText(targetPermRange)) {
            return;
        }
        try {
            User patch = new User();
            patch.setId(user.getId());
            patch.setPermissionRange(targetPermRange);
            if (userService.updateById(patch)) {
                user.setPermissionRange(targetPermRange);
                log.info("[{}] 已自动修复用户权限范围 userId={} -> {}", scene, user.getId(), targetPermRange);
            }
        } catch (Exception e) {
            log.warn("[{}] 自动修复用户权限范围失败 userId={} err={}",
                    scene, user.getId(), e.getMessage());
        }
    }

    public void assertLoginAllowed(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) {
            return;
        }
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
        if (!StringUtils.hasText(key)) {
            return;
        }
        try {
            if (stringRedisTemplate == null) return;
            String failKey = REDIS_LOGIN_FAIL_PREFIX + key;
            Long count = stringRedisTemplate.opsForValue().increment(failKey);
            if (count != null && count == 1) {
                stringRedisTemplate.expire(failKey, LOGIN_WINDOW_SECONDS, java.util.concurrent.TimeUnit.SECONDS);
            }
            if (count != null && count >= LOGIN_MAX_FAILURES) {
                String lockKey = REDIS_LOGIN_LOCK_PREFIX + key;
                stringRedisTemplate.opsForValue().set(lockKey, String.valueOf(count), LOGIN_LOCK_SECONDS, java.util.concurrent.TimeUnit.SECONDS);
                stringRedisTemplate.delete(failKey);
                log.warn("[LoginThrottle] 账号锁定: key={}, 失败次数={}", key, count);
            }
        } catch (Exception e) {
            log.warn("[LoginThrottle] Redis记录失败异常: {}", e.getMessage());
        }
    }

    public void onLoginSuccess(String username, String ip) {
        String key = loginThrottleKey(username, ip);
        if (!StringUtils.hasText(key)) {
            return;
        }
        try {
            if (stringRedisTemplate == null) return;
            stringRedisTemplate.delete(REDIS_LOGIN_FAIL_PREFIX + key);
            stringRedisTemplate.delete(REDIS_LOGIN_LOCK_PREFIX + key);
        } catch (Exception e) {
            log.warn("[LoginThrottle] Redis清除失败计数异常: {}", e.getMessage());
        }
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
        result.put("avatarUrl", user.getAvatarUrl());
        result.put("tenantId", user.getTenantId());
        result.put("isTenantOwner", Boolean.TRUE.equals(user.getIsTenantOwner()));
        result.put("isSuperAdmin", Boolean.TRUE.equals(user.getIsSuperAdmin()));
        // 外发工厂联系人：返回 factoryId，前端据此进入工厂端视图
        if (user.getFactoryId() != null && !user.getFactoryId().isBlank()) {
            result.put("factoryId", user.getFactoryId());
        }
        // 补充 tenantName 和 tenantType，从数据库实时查询（保证修改后立即生效）
        if (user.getTenantId() != null && tenantService != null) {
            try {
                Tenant currentTenant = tenantService.getById(user.getTenantId());
                if (currentTenant != null) {
                    if (StringUtils.hasText(currentTenant.getTenantName())) {
                        result.put("tenantName", currentTenant.getTenantName());
                    }
                    if (StringUtils.hasText(currentTenant.getTenantType())) {
                        result.put("tenantType", currentTenant.getTenantType());
                    }
                    // 返回模块白名单（null=全部开放，有值=前端按列表过滤菜单）
                    if (StringUtils.hasText(currentTenant.getEnabledModules())) {
                        result.put("tenantEnabledModules", currentTenant.getEnabledModules());
                    }
                }
            } catch (Exception ignored) {
                // 查询租户信息失败不影响主流程
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
            // 登录成功时同步更新 t_user 的最后登录时间和IP
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

    /**
     * 租户管理员重置工厂成员密码（无需旧密码）。
     * 仅允许重置同租户内 factoryId != null 的外发工厂账号。
     */
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void adminResetMemberPassword(String userId, String newPassword) {
        if (!StringUtils.hasText(userId)) {
            throw new IllegalArgumentException("用户ID不能为空");
        }
        if (!StringUtils.hasText(newPassword) || newPassword.trim().length() < 6) {
            throw new IllegalArgumentException("新密码不能少于6个字符");
        }
        Long tenantId = UserContext.tenantId();
        User target = userService.getById(Long.valueOf(userId));
        if (target == null) {
            throw new NoSuchElementException("用户不存在");
        }
        if (!java.util.Objects.equals(target.getTenantId(), tenantId)) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }
        if (target.getFactoryId() == null) {
            throw new IllegalArgumentException("只能重置外发工厂成员的密码");
        }
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        target.setPassword(encoder.encode(newPassword.trim()));
        userService.updateById(target);
        if (stringRedisTemplate != null && target.getId() != null) {
            try {
                stringRedisTemplate.opsForValue().increment(PWD_VER_KEY_PREFIX + target.getId());
            } catch (Exception e) {
                log.warn("[管理员重置密码] 更新密码版本号失败（Redis 不可用），旧 token 不会立即失效 userId={}", target.getId());
            }
        }
        saveOperationLog("user", String.valueOf(target.getId()), target.getUsername(),
                "ADMIN_RESET_PASSWORD", "管理员重置工厂成员密码");
    }

    private record ExpiringValue(String value, long expireAtMillis) {
        private boolean expired() {
            return System.currentTimeMillis() >= expireAtMillis;
        }
    }

}
