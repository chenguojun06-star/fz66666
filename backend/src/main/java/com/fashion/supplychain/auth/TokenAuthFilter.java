package com.fashion.supplychain.auth;

import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.lang.NonNull;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * JWT令牌认证过滤器
 * 从请求头中解析Bearer Token并设置安全上下文
 * 同时加载用户权限代码作为Spring Security authorities，
 * 使得 @PreAuthorize("hasAuthority('MENU_XXX')") 能正确工作
 */
public class TokenAuthFilter extends OncePerRequestFilter {

    /** Request Attribute Key: 存储解析后的TokenSubject */
    public static final String TOKEN_SUBJECT_ATTR = "TOKEN_SUBJECT";

    private final AuthTokenService authTokenService;
    private final PermissionCalculationEngine permissionEngine;

    public TokenAuthFilter(AuthTokenService authTokenService, PermissionCalculationEngine permissionEngine) {
        this.authTokenService = authTokenService;
        this.permissionEngine = permissionEngine;
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

            TokenSubject subject = authTokenService == null ? null : authTokenService.verifyAndParse(token);
            if (subject != null && StringUtils.hasText(subject.getUsername())) {
                List<GrantedAuthority> authorities = new ArrayList<>();

                // 添加ROLE_前缀的角色权限（保持兼容性）
                addRoleAuthority(authorities, subject.getRoleId());
                addRoleAuthority(authorities, subject.getRoleName());

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
     */
    private void loadPermissionAuthorities(List<GrantedAuthority> authorities, TokenSubject subject) {
        if (permissionEngine == null) return;
        try {
            Long userId = null;
            Long roleId = null;
            Long tenantId = subject.getTenantId();

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

            if (roleId == null) return;

            List<String> permCodes = permissionEngine.calculatePermissions(userId, roleId, tenantId);
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
