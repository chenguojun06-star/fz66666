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
        Map<String, Object> result = new HashMap<>();
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

        User user = userService.login(u, p);
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
        m.put("status", user.getStatus());
        return m;
    }

    public void recordLoginAttempt(String username, String ip, String userAgent, String status, String message) {
        try {
            LoginLog log = new LoginLog();
            log.setUsername(safeTrim(username));
            log.setIp(safeTrim(ip));
            log.setLoginTime(LocalDateTime.now());
            log.setLoginStatus(safeTrim(status));
            log.setMessage(safeTrim(message));
            log.setUserAgent(safeTrim(userAgent));
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
}
