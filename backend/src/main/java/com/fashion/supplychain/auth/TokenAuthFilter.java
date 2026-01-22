package com.fashion.supplychain.auth;

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
 */
public class TokenAuthFilter extends OncePerRequestFilter {

    /** Request Attribute Key: 存储解析后的TokenSubject */
    public static final String TOKEN_SUBJECT_ATTR = "TOKEN_SUBJECT";

    private final AuthTokenService authTokenService;

    public TokenAuthFilter(AuthTokenService authTokenService) {
        this.authTokenService = authTokenService;
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
                addRoleAuthority(authorities, subject.getRoleId());
                addRoleAuthority(authorities, subject.getRoleName());

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
