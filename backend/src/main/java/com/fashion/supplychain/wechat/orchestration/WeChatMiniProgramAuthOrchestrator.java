package com.fashion.supplychain.wechat.orchestration;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.system.entity.LoginLog;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.wechat.client.WeChatMiniProgramClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class WeChatMiniProgramAuthOrchestrator {

    private final WeChatMiniProgramClient weChatMiniProgramClient;
    private final UserService userService;
    private final AuthTokenService authTokenService;
    private final LoginLogService loginLogService;

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

        String u = username == null ? "" : username.trim();
        String p = password == null ? "" : password.trim();
        if (!StringUtils.hasText(u) || !StringUtils.hasText(p)) {
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
