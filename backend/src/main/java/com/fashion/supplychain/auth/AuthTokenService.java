package com.fashion.supplychain.auth;

import cn.hutool.jwt.JWT;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class AuthTokenService {

    private final byte[] secret;

    public AuthTokenService(@Value("${app.auth.jwt-secret:}") String secret) {
        String s = secret == null ? "" : secret.trim();
        if (!StringUtils.hasText(s)) {
            throw new IllegalStateException("app.auth.jwt-secret 未配置");
        }
        if ("dev-secret-change-me".equals(s)) {
            throw new IllegalStateException("app.auth.jwt-secret 不能使用默认占位值");
        }
        if (s.length() < 32) {
            throw new IllegalStateException("app.auth.jwt-secret 长度过短，至少 32 位");
        }
        this.secret = s.getBytes(StandardCharsets.UTF_8);
    }

    public String issueToken(TokenSubject subject, Duration ttl) {
        if (subject == null) {
            return null;
        }
        Duration safeTtl = ttl == null ? Duration.ofHours(12) : ttl;
        long nowMillis = System.currentTimeMillis();

        Map<String, Object> payload = new HashMap<>();
        payload.put("uid", subject.getUserId());
        payload.put("uname", subject.getUsername());
        payload.put("roleId", subject.getRoleId());
        payload.put("roleName", subject.getRoleName());
        payload.put("openid", subject.getOpenid());
        payload.put("permRange", subject.getPermissionRange()); // 数据权限范围
        payload.put("tenantId", subject.getTenantId()); // 租户ID
        payload.put("tenantOwner", subject.isTenantOwner()); // 是否租户主账号
        payload.put("superAdmin", subject.isSuperAdmin()); // 平台超级管理员
        payload.put("iat", new Date(nowMillis));
        payload.put("exp", new Date(nowMillis + safeTtl.toMillis()));

        return JWT.create().addPayloads(payload).setKey(secret).sign();
    }

    public TokenSubject verifyAndParse(String token) {
        String t = token == null ? "" : token.trim();
        if (!StringUtils.hasText(t)) {
            return null;
        }

        JWT jwt;
        try {
            jwt = JWT.of(t).setKey(secret);
        } catch (Exception e) {
            return null;
        }

        boolean ok;
        try {
            ok = jwt.verify() && jwt.validate(0);
        } catch (Exception e) {
            ok = false;
        }
        if (!ok) {
            return null;
        }

        Object uid = jwt.getPayload("uid");
        Object uname = jwt.getPayload("uname");
        Object roleId = jwt.getPayload("roleId");
        Object roleName = jwt.getPayload("roleName");
        Object openid = jwt.getPayload("openid");
        Object permRange = jwt.getPayload("permRange");
        Object tenantIdObj = jwt.getPayload("tenantId");
        Object tenantOwnerObj = jwt.getPayload("tenantOwner");

        TokenSubject subject = new TokenSubject();
        subject.setUserId(uid == null ? null : String.valueOf(uid));
        subject.setUsername(uname == null ? null : String.valueOf(uname));
        subject.setRoleId(roleId == null ? null : String.valueOf(roleId));
        subject.setRoleName(roleName == null ? null : String.valueOf(roleName));
        subject.setOpenid(openid == null ? null : String.valueOf(openid));
        // 安全修复：JWT中无permRange时，管理员/租户主默认"all"，普通员工默认"own"
        if (permRange != null) {
            subject.setPermissionRange(String.valueOf(permRange));
        } else {
            boolean isTenantOwner = Boolean.TRUE.equals(tenantOwnerObj);
            boolean isAdmin = isAdminRoleName(roleName == null ? null : String.valueOf(roleName));
            subject.setPermissionRange((isTenantOwner || isAdmin) ? "all" : "own");
        }
        // 解析租户信息
        if (tenantIdObj != null) {
            try {
                subject.setTenantId(Long.valueOf(String.valueOf(tenantIdObj)));
            } catch (NumberFormatException e) {
                subject.setTenantId(null);
            }
        }
        subject.setTenantOwner(Boolean.TRUE.equals(tenantOwnerObj));
        Object superAdminObj = jwt.getPayload("superAdmin");
        subject.setSuperAdmin(Boolean.TRUE.equals(superAdminObj));
        return subject;
    }

    /**
     * 获取当前登录用户ID
     * @return 用户ID，未登录时返回null
     */
    public String getCurrentUserId() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated() && authentication.getPrincipal() instanceof TokenSubject) {
                TokenSubject subject = (TokenSubject) authentication.getPrincipal();
                return subject.getUserId();
            }
        } catch (Exception e) {
            log.debug("Failed to get current user id", e);
        }
        return null;
    }

    /**
     * 获取当前登录用户姓名
     * @return 用户姓名，未登录或获取失败时返回"系统管理员"
     */
    public String getCurrentUsername() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated() && authentication.getPrincipal() instanceof TokenSubject) {
                TokenSubject subject = (TokenSubject) authentication.getPrincipal();
                String username = subject.getUsername();
                return StringUtils.hasText(username) ? username : "系统管理员";
            }
        } catch (Exception e) {
            log.debug("Failed to get current username", e);
        }
        return "系统管理员";
    }

    /**
     * 判断角色名称是否属于管理员角色
     * 用于JWT解析时确定默认数据权限范围（防止旧版Token无permRange字段时越权）
     */
    private static boolean isAdminRoleName(String roleName) {
        if (roleName == null || roleName.isBlank()) {
            return false;
        }
        String r = roleName.trim().toLowerCase();
        return "1".equals(roleName.trim()) || r.contains("admin") || r.contains("管理员") || r.contains("管理");
    }

    /**
     * 获取当前登录用户的完整信息
     * @return TokenSubject对象，未登录时返回null
     */
    public TokenSubject getCurrentUser() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated() && authentication.getPrincipal() instanceof TokenSubject) {
                return (TokenSubject) authentication.getPrincipal();
            }
        } catch (Exception e) {
            log.debug("Failed to get current user", e);
        }
        return null;
    }
}
