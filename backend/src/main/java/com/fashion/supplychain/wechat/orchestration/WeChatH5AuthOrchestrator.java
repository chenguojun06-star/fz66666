package com.fashion.supplychain.wechat.orchestration;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class WeChatH5AuthOrchestrator {

    @Value("${app.wechat.h5.app-id:}")
    private String h5AppId;

    @Value("${app.wechat.h5.app-secret:}")
    private String h5AppSecret;

    private static final String JSAPI_TICKET_KEY = "wx:h5:jsapi_ticket";
    private static final String ACCESS_TOKEN_KEY = "wx:h5:access_token";
    private static final Duration TOKEN_TTL = Duration.ofDays(7);

    @Autowired
    private UserService userService;

    @Autowired
    private AuthTokenService authTokenService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public Map<String, Object> generateJsSdkConfig(String url) {
        Map<String, Object> config = new HashMap<>();
        String ticket = getJsApiTicket();
        String nonceStr = generateNonceStr();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
        String signStr = "jsapi_ticket=" + ticket + "&noncestr=" + nonceStr
                + "&timestamp=" + timestamp + "&url=" + url;
        String signature = sha1(signStr);
        config.put("appId", h5AppId);
        config.put("timestamp", timestamp);
        config.put("nonceStr", nonceStr);
        config.put("signature", signature);
        return config;
    }

    public Map<String, Object> oauthLogin(String code) {
        Map<String, Object> result = new HashMap<>();
        try {
            Map<String, Object> tokenInfo = fetchH5AccessToken(code);
            if (tokenInfo == null || tokenInfo.get("openid") == null) {
                result.put("success", false);
                result.put("message", "获取微信授权信息失败");
                return result;
            }
            String openid = String.valueOf(tokenInfo.get("openid"));
            String unionid = tokenInfo.get("unionid") != null ? String.valueOf(tokenInfo.get("unionid")) : null;

            User user = findUserByOpenId(openid, unionid);
            if (user != null && user.getId() != null) {
                TokenSubject subject = buildTokenSubject(user);
                String token = authTokenService.issueToken(subject, TOKEN_TTL);
                result.put("success", true);
                result.put("token", token);
                result.put("user", buildUserInfo(user));
                return result;
            }

            result.put("success", false);
            result.put("needBind", true);
            result.put("openid", openid);
            return result;
        } catch (Exception e) {
            log.error("H5 OAuth login failed", e);
            result.put("success", false);
            result.put("message", "微信授权登录异常");
            return result;
        }
    }

    public Map<String, Object> bindAndLogin(String openid, String username, String password, Long tenantId) {
        Map<String, Object> result = new HashMap<>();
        try {
            User user;
            if (tenantId != null) {
                user = userService.lambdaQuery()
                        .eq(User::getUsername, username)
                        .eq(User::getTenantId, tenantId)
                        .one();
            } else {
                user = userService.lambdaQuery()
                        .eq(User::getUsername, username)
                        .last("limit 1")
                        .one();
            }

            if (user == null) {
                result.put("success", false);
                result.put("message", "用户不存在");
                return result;
            }

            if (!passwordEncoder.matches(password, user.getPassword())) {
                result.put("success", false);
                result.put("message", "密码错误");
                return result;
            }

            if (user.getOpenid() == null || user.getOpenid().isBlank()) {
                user.setOpenid(openid);
                userService.updateById(user);
            }

            TokenSubject subject = buildTokenSubject(user);
            String token = authTokenService.issueToken(subject, TOKEN_TTL);
            result.put("success", true);
            result.put("token", token);
            result.put("user", buildUserInfo(user));
            return result;
        } catch (Exception e) {
            log.error("H5 bind and login failed", e);
            result.put("success", false);
            result.put("message", "绑定登录异常");
            return result;
        }
    }

    private User findUserByOpenId(String openid, String unionid) {
        User user = userService.lambdaQuery()
                .eq(User::getOpenid, openid)
                .last("limit 1")
                .one();
        return user;
    }

    private TokenSubject buildTokenSubject(User user) {
        TokenSubject subject = new TokenSubject();
        subject.setUserId(String.valueOf(user.getId()));
        subject.setUsername(user.getName() != null ? user.getName() : user.getUsername());
        subject.setRoleId(user.getRoleId() != null ? String.valueOf(user.getRoleId()) : null);
        subject.setRoleName(user.getRoleName());
        subject.setOpenid(user.getOpenid());
        subject.setPermissionRange(user.getPermissionRange());
        subject.setTenantId(user.getTenantId());
        subject.setTenantOwner(Boolean.TRUE.equals(user.getIsTenantOwner()));
        subject.setSuperAdmin(Boolean.TRUE.equals(user.getIsSuperAdmin()));
        subject.setFactoryId(user.getFactoryId());
        return subject;
    }

    private Map<String, Object> buildUserInfo(User user) {
        Map<String, Object> info = new HashMap<>();
        info.put("id", user.getId());
        info.put("username", user.getUsername());
        info.put("name", user.getName());
        info.put("roleName", user.getRoleName());
        info.put("tenantId", user.getTenantId());
        info.put("tenantName", user.getTenantName());
        info.put("isTenantOwner", user.getIsTenantOwner());
        info.put("avatarUrl", user.getAvatarUrl());
        return info;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchH5AccessToken(String code) {
        try {
            String url;
            if (StringUtils.hasText(code)) {
                url = "https://api.weixin.qq.com/sns/oauth2/access_token?appid=" + h5AppId
                        + "&secret=" + h5AppSecret + "&code=" + code + "&grant_type=authorization_code";
            } else {
                url = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="
                        + h5AppId + "&secret=" + h5AppSecret;
            }
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return objectMapper.readValue(response.body(), Map.class);
        } catch (Exception e) {
            log.error("Fetch H5 access token failed", e);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String getJsApiTicket() {
        if (stringRedisTemplate != null) {
            String cached = stringRedisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
            if (StringUtils.hasText(cached)) return cached;
        }
        try {
            String accessToken = getH5ClientCredentialToken();
            String url = "https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=" + accessToken + "&type=jsapi";
            HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> res = objectMapper.readValue(response.body(), Map.class);
            String ticket = res.get("ticket") != null ? String.valueOf(res.get("ticket")) : null;
            if (StringUtils.hasText(ticket) && stringRedisTemplate != null) {
                stringRedisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, Duration.ofSeconds(7000));
            }
            return ticket != null ? ticket : "";
        } catch (Exception e) {
            log.error("Get JSAPI ticket failed", e);
            return "";
        }
    }

    private String getH5ClientCredentialToken() {
        if (stringRedisTemplate != null) {
            String cached = stringRedisTemplate.opsForValue().get(ACCESS_TOKEN_KEY);
            if (StringUtils.hasText(cached)) return cached;
        }
        try {
            Map<String, Object> res = fetchH5AccessToken(null);
            String token = res != null && res.get("access_token") != null ? String.valueOf(res.get("access_token")) : null;
            if (StringUtils.hasText(token) && stringRedisTemplate != null) {
                Integer expires = res.get("expires_in") != null ? ((Number) res.get("expires_in")).intValue() : 7000;
                stringRedisTemplate.opsForValue().set(ACCESS_TOKEN_KEY, token, Duration.ofSeconds(Math.min(expires, 7000)));
            }
            return token != null ? token : "";
        } catch (Exception e) {
            log.error("Get H5 client credential token failed", e);
            return "";
        }
    }

    private static String generateNonceStr() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha1(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("SHA-1 failed", e);
        }
    }
}
