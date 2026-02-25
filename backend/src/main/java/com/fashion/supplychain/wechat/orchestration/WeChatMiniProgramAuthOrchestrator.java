package com.fashion.supplychain.wechat.orchestration;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.wechat.client.WeChatMiniProgramClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class WeChatMiniProgramAuthOrchestrator {

    private final WeChatMiniProgramClient weChatMiniProgramClient;
    private final UserService userService;
    private final AuthTokenService authTokenService;
    private final LoginLogService loginLogService;

    /** Redis key 前缀：pwd:ver:{userId} */
    private static final String PWD_VER_KEY_PREFIX = "pwd:ver:";

    /** Redis key：微信接口调用凭证缓存 */
    private static final String WX_ACCESS_TOKEN_KEY = "wx:access_token";

    /** Redis key 前缀：wx:invite:{token} = tenantId:tenantName */
    private static final String INVITE_TOKEN_PREFIX = "wx:invite:";

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    public WeChatMiniProgramAuthOrchestrator(
            WeChatMiniProgramClient weChatMiniProgramClient,
            UserService userService,
            AuthTokenService authTokenService,
            LoginLogService loginLogService) {
        this.weChatMiniProgramClient = weChatMiniProgramClient;
        this.userService = userService;
        this.authTokenService = authTokenService;
        this.loginLogService = loginLogService;
    }

    public Map<String, Object> login(String code, String username, String password) {
        return login(code, username, password, null);
    }

    public Map<String, Object> login(String code, String username, String password, Long tenantId) {
        Map<String, Object> result = new HashMap<>();
        // 如果是模拟环境或测试账号，允许空code通过
        if ((code == null || code.isBlank()) && (username != null && username.startsWith("test"))) {
            code = "mock_" + username;
        }

        WeChatMiniProgramClient.Code2SessionResult session = weChatMiniProgramClient.code2Session(code);
        if (session == null || !session.isSuccess()) {
            result.put("success", false);
            result.put("message", session == null ? "微信登录失败" : session.getMessage());
            return result;
        }

        String openid = session.getOpenid();
        result.put("openid", openid);

        // ✅ 方案A：优先检查 openid 是否已绑定账号（一键登录，无需密码）
        if (StringUtils.hasText(openid) && !openid.startsWith("mock_")) {
            User boundUser = userService.findByOpenid(openid);
            if (boundUser != null) {
                log.info("[WxLogin] openid 已绑定用户 userId={}, 直接登录", boundUser.getId());
                return buildLoginSuccess(result, boundUser, openid);
            }
        }

        // openid 未绑定 → 检查是否携带账号密码（首次绑定）
        String u = username == null ? "" : username.trim();
        String p = password == null ? "" : password.trim();
        if (!StringUtils.hasText(u) || !StringUtils.hasText(p)) {
            // 未绑定且无账号密码 → 要求用户输入账号绑定
            result.put("success", true);
            result.put("needBind", true);
            return result;
        }

        User user = userService.login(u, p, tenantId);
        if (user == null) {
            result.put("success", false);
            result.put("message", "用户名或密码错误");
            return result;
        }

        // 首次绑定：将 openid 存入用户记录
        if (StringUtils.hasText(openid) && !openid.startsWith("mock_")) {
            try {
                userService.bindOpenid(user.getId(), openid);
                log.info("[WxLogin] openid 首次绑定成功 userId={}", user.getId());
            } catch (Exception e) {
                log.warn("[WxLogin] openid 绑定失败 userId={}, openid={}", user.getId(), openid, e);
                // 绑定失败不影响本次登录
            }
        }

        return buildLoginSuccess(result, user, openid);
    }

    /**
     * 构建登录成功响应（抽取公共逻辑）
     */
    private Map<String, Object> buildLoginSuccess(Map<String, Object> result, User user, String openid) {
        TokenSubject subject = new TokenSubject();
        subject.setUserId(user.getId() == null ? null : String.valueOf(user.getId()));
        subject.setUsername(StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername());
        subject.setRoleId(user.getRoleId() == null ? null : String.valueOf(user.getRoleId()));
        subject.setRoleName(user.getRoleName());
        subject.setOpenid(openid);
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
        // 读取密码版本号，嵌入 JWT
        long pwdVersion = 0L;
        if (stringRedisTemplate != null && user.getId() != null) {
            try {
                String v = stringRedisTemplate.opsForValue().get(PWD_VER_KEY_PREFIX + user.getId());
                if (v != null) pwdVersion = Long.parseLong(v);
            } catch (Exception e) {
                log.debug("[WxLogin] 读取 pwdVersion 失败（Redis 不可用），使用默认值 0");
            }
        }
        subject.setPwdVersion(pwdVersion);

        String token = authTokenService.issueToken(subject, Duration.ofHours(12));
        if (!StringUtils.hasText(token)) {
            result.put("success", false);
            result.put("message", "生成登录令牌失败");
            return result;
        }

        result.put("success", true);
        result.put("needBind", false);
        result.put("token", token);
        result.put("user", toSafeUser(user));
        return result;
    }

    private Map<String, Object> toSafeUser(User user) {
        Map<String, Object> m = new HashMap<>();
        if (user == null) {
            return m;
        }
        m.put("id", user.getId());
        m.put("username", user.getUsername());
        m.put("name", user.getName());
        m.put("roleId", user.getRoleId());
        m.put("roleName", user.getRoleName());
        m.put("roleCode", getRoleCode(user.getRoleId(), user.getRoleName()));
        m.put("status", user.getStatus());
        m.put("tenantId", user.getTenantId());
        m.put("isTenantOwner", Boolean.TRUE.equals(user.getIsTenantOwner()));
        return m;
    }

    /**
     * 根据角色ID或角色名称推断角色代码
     * 用于小程序权限控制
     */
    private String getRoleCode(Long roleId, String roleName) {
        // 如果有角色名称，根据名称推断角色代码
        if (StringUtils.hasText(roleName)) {
            String name = roleName.trim().toLowerCase();
            // 管理员
            if (name.contains("管理员") || name.contains("admin")) {
                return "admin";
            }
            // 主管/经理
            if (name.contains("主管") || name.contains("经理") || name.contains("supervisor") || name.contains("manager")) {
                return "supervisor";
            }
            // 采购员
            if (name.contains("采购") || name.contains("purchaser")) {
                return "purchaser";
            }
            // 裁剪工
            if (name.contains("裁剪") || name.contains("cutter")) {
                return "cutter";
            }
            // 车缝工
            if (name.contains("车缝") || name.contains("缝制") || name.contains("sewing")) {
                return "sewing";
            }
            // 包装工
            if (name.contains("包装") || name.contains("packager")) {
                return "packager";
            }
            // 质检员
            if (name.contains("质检") || name.contains("quality")) {
                return "quality";
            }
            // 仓管员
            if (name.contains("仓管") || name.contains("仓库") || name.contains("warehouse")) {
                return "warehouse";
            }
        }

        // 默认返回空字符串，表示无特殊权限限制
        return "";
    }

    public void recordLoginAttempt(String username, String ip, String userAgent, String status, String message) {
        try {
            LoginLog log = new LoginLog();
            log.setLogType("LOGIN"); // 设置日志类型为登录
            log.setUsername(safeTrim(username));
            log.setIp(safeTrim(ip));
            log.setLoginTime(LocalDateTime.now());
            log.setLoginStatus(safeTrim(status));
            log.setMessage(safeTrim(message));
            log.setUserAgent(limitLength(safeTrim(userAgent), 200));
            // 多租户隔离：尝试通过 UserContext 或用户名查找租户ID
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            if (tenantId == null && username != null && !username.isBlank()) {
                try {
                    User found = userService.getOne(
                        new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<User>()
                            .eq(User::getUsername, safeTrim(username)).last("LIMIT 1"), false);
                    if (found != null) tenantId = found.getTenantId();
                } catch (Exception ignored) { }
            }
            log.setTenantId(tenantId);
            if (log.getUsername() != null && !log.getUsername().isBlank()) {
                loginLogService.save(log);
            }
        } catch (Exception e) {
            log.warn("Failed to record mini program login attempt: username={}, ip={}, status={}", username, ip,
                    status, e);
        }
    }

    private static String safeTrim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String limitLength(String value, int max) {
        if (value == null) {
            return null;
        }
        if (max <= 0 || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }

    // ======================== 邀请二维码 ========================

    /**
     * 生成邀请二维码（管理员调用）
     * 在 Redis 中存储 inviteToken → tenantId:tenantName（7天TTL），
     * 并调用微信 getwxacodeunlimit 接口返回 Base64 小程序码图片。
     *
     * @param tenantId   租户ID
     * @param tenantName 租户名称（用于小程序展示）
     * @return Map: qrCodeBase64（data:image/png;base64,...）, inviteToken, expiresAt
     */
    public Map<String, Object> generateInviteQrCode(Long tenantId, String tenantName) {
        String token = generateShortToken();
        String value = tenantId + ":" + (tenantName == null ? "" : tenantName);
        if (stringRedisTemplate != null) {
            stringRedisTemplate.opsForValue().set(
                    INVITE_TOKEN_PREFIX + token, value, Duration.ofDays(7));
        } else {
            log.warn("[InviteQr] Redis 不可用，邀请 token 无法持久化 token={}", token);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("inviteToken", token);
        result.put("expiresAt", LocalDateTime.now().plusDays(7).toString());

        String accessToken = getCachedAccessToken();
        if (accessToken == null) {
            log.warn("[InviteQr] 无法获取微信 access_token，仅返回 token 不返回图片");
            return result;
        }

        String scene = "inviteToken=" + token;
        byte[] qrBytes = weChatMiniProgramClient.fetchMiniProgramQrCode(
                accessToken, scene, "pages/login/index");
        if (qrBytes != null) {
            result.put("qrCodeBase64",
                    "data:image/png;base64," + Base64.getEncoder().encodeToString(qrBytes));
        } else {
            log.warn("[InviteQr] 微信接口返回空图片 token={}", token);
        }
        return result;
    }

    /**
     * 解析邀请 token，返回 {tenantId, tenantName}；token 不存在/已过期返回 null
     */
    public Map<String, Object> resolveInviteToken(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        String value = null;
        if (stringRedisTemplate != null) {
            value = stringRedisTemplate.opsForValue().get(INVITE_TOKEN_PREFIX + token);
        }
        if (!StringUtils.hasText(value)) {
            return null;
        }
        int sep = value.indexOf(':');
        if (sep < 1) {
            return null;
        }
        try {
            long tenantId = Long.parseLong(value.substring(0, sep));
            String tenantName = value.substring(sep + 1);
            Map<String, Object> res = new HashMap<>();
            res.put("tenantId", tenantId);
            res.put("tenantName", tenantName);
            return res;
        } catch (NumberFormatException e) {
            log.warn("[InviteQr] resolveInviteToken 解析 tenantId 失败 value={}", value);
            return null;
        }
    }

    /**
     * 获取并缓存微信 access_token（Redis 90分钟TTL）
     */
    private String getCachedAccessToken() {
        if (stringRedisTemplate != null) {
            String cached = stringRedisTemplate.opsForValue().get(WX_ACCESS_TOKEN_KEY);
            if (StringUtils.hasText(cached)) {
                return cached;
            }
        }
        String fresh = weChatMiniProgramClient.fetchAccessToken();
        if (fresh != null && stringRedisTemplate != null) {
            stringRedisTemplate.opsForValue().set(WX_ACCESS_TOKEN_KEY, fresh, Duration.ofMinutes(90));
        }
        return fresh;
    }

    /**
     * 生成 8 位十六进制短 token（大写）
     */
    private String generateShortToken() {
        String hex = Long.toHexString(System.nanoTime()).toUpperCase();
        // 取后8位避免前导0过多
        if (hex.length() >= 8) {
            return hex.substring(hex.length() - 8);
        }
        return String.format("%8s", hex).replace(' ', '0');
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
}
