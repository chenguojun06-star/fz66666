package com.fashion.supplychain.auth;

import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.lang.NonNull;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * JWT令牌认证过滤器
 * 从请求头中解析Bearer Token并设置安全上下文
 * 同时加载用户权限代码作为Spring Security authorities，
 * 使得 @PreAuthorize("hasAuthority('MENU_XXX')") 能正确工作
 */
@Slf4j
public class TokenAuthFilter extends OncePerRequestFilter {

    /** Request Attribute Key: 存储解析后的TokenSubject */
    public static final String TOKEN_SUBJECT_ATTR = "TOKEN_SUBJECT";
    /** Redis key 前缀：pwd:ver:{userId} */
    private static final String PWD_VER_KEY_PREFIX = "pwd:ver:";
    /** Redis 熔断：连接失败后跳过检查的毫秒数 */
    private static final long REDIS_CIRCUIT_BREAK_MS = 60_000L;
    /** 上次 Redis 连接失败的时间戳（0 = 正常） */
    private final AtomicLong redisFailedSince = new AtomicLong(0L);

    private final AuthTokenService authTokenService;
    private final PermissionCalculationEngine permissionEngine;
    private final StringRedisTemplate stringRedisTemplate;

    public TokenAuthFilter(AuthTokenService authTokenService, PermissionCalculationEngine permissionEngine,
                           StringRedisTemplate stringRedisTemplate) {
        this.authTokenService = authTokenService;
        this.permissionEngine = permissionEngine;
        this.stringRedisTemplate = stringRedisTemplate;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String header = request.getHeader("Authorization");
            String token = null;
            if (StringUtils.hasText(header)) {
                String h = header.trim();
                if (h.regionMatches(true, 0, "Bearer ", 0, 7)) {
                    token = h.substring(7).trim();
                }
            }

            // 支持通过 URL 查询参数传递 token（用于文件下载等浏览器直接打开的场景）
            if (token == null) {
                String queryToken = request.getParameter("token");
                if (StringUtils.hasText(queryToken)) {
                    token = queryToken.trim();
                }
            }

            TokenSubject subject = authTokenService == null ? null : authTokenService.verifyAndParse(token);
            // 校验密码版本号：改密后旧 token 立即失效
            if (subject != null && StringUtils.hasText(subject.getUserId()) && stringRedisTemplate != null) {
                long failTs = redisFailedSince.get();
                boolean skip = failTs > 0 && (System.currentTimeMillis() - failTs) < REDIS_CIRCUIT_BREAK_MS;
                if (!skip) {
                    try {
                        String storedVer = stringRedisTemplate.opsForValue().get(PWD_VER_KEY_PREFIX + subject.getUserId());
                        long expected = storedVer == null ? 0L : Long.parseLong(storedVer);
                        Long tokenVer = subject.getPwdVersion();
                        if (tokenVer == null || tokenVer < expected) {
                            log.debug("[TokenAuthFilter] token已失效（密码已更改），userId={}", subject.getUserId());
                            subject = null; // token 已失效，视作未认证
                        }
                        redisFailedSince.set(0L); // 连接恢复，重置熔断
                    } catch (Exception e) {
                        // Redis 不可用时熔断 60s，避免每个请求都尝试连接
                        if (redisFailedSince.compareAndSet(0L, System.currentTimeMillis())) {
                            log.warn("[TokenAuthFilter] Redis 不可用，pwdVersion 校验已熔断 {}s", REDIS_CIRCUIT_BREAK_MS / 1000);
                        }
                    }
                }
            }
            if (subject != null && StringUtils.hasText(subject.getUsername())) {
                List<GrantedAuthority> authorities = new ArrayList<>();

                // 添加ROLE_前缀的角色权限（保持兼容性）
                addRoleAuthority(authorities, subject.getRoleId());
                addRoleAuthority(authorities, subject.getRoleName());

                // 租户主账号：添加 ROLE_tenant_owner 权限
                if (subject.isTenantOwner()) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_tenant_owner"));
                }

                // 平台超级管理员：添加 ROLE_SUPER_ADMIN 权限
                if (subject.isSuperAdmin()) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"));
                }

                // 🔑 关键修复：注入权限代码作为authorities
                // 使 @PreAuthorize("hasAuthority('MENU_XXX')") 正确工作
                loadPermissionAuthorities(authorities, subject);

                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        subject.getUsername(),
                        subject.getUserId(),
                        authorities);
                SecurityContextHolder.getContext().setAuthentication(auth);

                // 将TokenSubject存储在request attribute中，供后续Interceptor使用
                request.setAttribute(TOKEN_SUBJECT_ATTR, subject);
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * 从权限计算引擎加载用户权限代码，注入为Spring Security authorities
     * 三级权限计算: 角色权限 ∩ 租户天花板 ∪ 用户GRANT - 用户REVOKE
     * 租户主账号: roleId为null时仍可获得天花板内全部权限
     */
    private void loadPermissionAuthorities(List<GrantedAuthority> authorities, TokenSubject subject) {
        if (permissionEngine == null) return;
        try {
            Long userId = null;
            Long roleId = null;
            Long tenantId = subject.getTenantId();
            boolean isTenantOwner = subject.isTenantOwner();

            // 解析userId
            String userIdStr = subject.getUserId();
            if (StringUtils.hasText(userIdStr)) {
                try { userId = Long.valueOf(userIdStr); } catch (NumberFormatException ignored) {}
            }

            // 解析roleId
            String roleIdStr = subject.getRoleId();
            if (StringUtils.hasText(roleIdStr)) {
                try { roleId = Long.valueOf(roleIdStr); } catch (NumberFormatException ignored) {}
            }

            // 超级管理员：调用权限引擎获取全部权限（tenantId传null触发超管分支）
            // 以后新增任何权限，超管自动获得，无需手动配置
            if (subject.isSuperAdmin()) {
                List<String> permCodes = permissionEngine.calculatePermissions(userId, roleId, null, false);
                if (permCodes != null) {
                    for (String code : permCodes) {
                        if (StringUtils.hasText(code)) {
                            authorities.add(new SimpleGrantedAuthority(code));
                        }
                    }
                }
                return;
            }

            // 租户主账号即使没有roleId也应获得权限
            if (roleId == null && !isTenantOwner) return;

            List<String> permCodes = permissionEngine.calculatePermissions(userId, roleId, tenantId, isTenantOwner);
            if (permCodes != null) {
                for (String code : permCodes) {
                    if (StringUtils.hasText(code)) {
                        authorities.add(new SimpleGrantedAuthority(code));
                    }
                }
            }
        } catch (Exception e) {
            // 权限加载失败不应阻断请求，降级为仅ROLE_角色权限
            // 日志已在PermissionCalculationEngine中记录
        }
    }

    private void addRoleAuthority(List<GrantedAuthority> authorities, String role) {
        if (!StringUtils.hasText(role) || authorities == null) {
            return;
        }
        String[] parts = role.split("[,;\\s]+");
        for (String p : parts) {
            if (!StringUtils.hasText(p)) {
                continue;
            }
            String r = p.trim();
            if (!r.isEmpty()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + r));
            }
        }
    }
}
