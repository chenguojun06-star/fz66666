package com.fashion.supplychain.config;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenAuthFilter;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpMethod;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSecurity
@Slf4j
public class SecurityConfig implements WebMvcConfigurer {

    @Value("${app.auth.header-auth-enabled:false}")
    private boolean headerAuthEnabled;

    @Value("${app.security.trusted-ips:}")
    private List<String> trustedIps;

    @Value("${app.security.trusted-ip-prefixes:}")
    private List<String> trustedIpPrefixes;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, AuthTokenService authTokenService) throws Exception {
        http
                .cors().and()
                .csrf().disable()
                .authorizeHttpRequests(authz -> authz
                        .antMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .antMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .antMatchers("/api/system/user/login").permitAll()
                        .antMatchers("/api/auth/register").permitAll()
                        .antMatchers("/api/common/download/**").permitAll()
                        .antMatchers(HttpMethod.GET, "/api/production/warehousing/list").permitAll()
                        .antMatchers("/api/system/user/me*", "/api/system/user/me/**").authenticated()
                        .antMatchers("/api/system/user/permissions*", "/api/system/user/permissions/**").authenticated()
                        .antMatchers("/api/system/user/online-count").authenticated()
                        .antMatchers("/api/system/user/pending").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1")
                        .antMatchers("/api/system/user/*/approve").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1")
                        .antMatchers("/api/system/user/*/reject").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1")
                        .antMatchers("/api/wechat/mini-program/login").permitAll()
                        .antMatchers("/api/production/order/by-order-no/**").permitAll()
                        .antMatchers("/api/production/order/detail/**").permitAll()
                        .antMatchers("/api/production/cutting-bundle/by-no").permitAll()
                        .antMatchers("/api/production/cutting/summary").permitAll()
                        .antMatchers("/api/production/order/node-operations/**").authenticated()
                        .antMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/actuator/info/**")
                        .permitAll()
                        .antMatchers("/actuator/prometheus", "/actuator/prometheus/**")
                        .permitAll()
                        .antMatchers("/api/warehouse/dashboard/**").authenticated()
                        .antMatchers("/actuator/**").hasAnyAuthority(
                                "ROLE_admin",
                                "ROLE_ADMIN",
                                "ROLE_1")
                        .antMatchers("/api/system/serial/**").authenticated()
                        .antMatchers("/api/system/**").hasAnyAuthority(
                                "ROLE_admin",
                                "ROLE_ADMIN",
                                "ROLE_1")
                        .antMatchers("/api/**").authenticated()
                        .anyRequest().permitAll());

        http.addFilterBefore(new TokenAuthFilter(authTokenService), UsernamePasswordAuthenticationFilter.class);
        http.addFilterBefore(new RequestIdFilter(), TokenAuthFilter.class);
        http.addFilterAfter(new HeaderAuthFilter(), TokenAuthFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public ApplicationRunner startupValidation(Environment environment) {
        return args -> {
            String jwtSecret = environment == null ? null : environment.getProperty("app.auth.jwt-secret");
            String s = jwtSecret == null ? "" : jwtSecret.trim();
            if (!org.springframework.util.StringUtils.hasText(s)) {
                throw new IllegalStateException("app.auth.jwt-secret 未配置（建议通过 APP_AUTH_JWT_SECRET 环境变量设置）");
            }
            if ("dev-secret-change-me".equals(s)) {
                throw new IllegalStateException("app.auth.jwt-secret 不能使用默认占位值");
            }
            if (s.length() < 32) {
                throw new IllegalStateException("app.auth.jwt-secret 长度过短，至少 32 位");
            }

            String dsUser = environment == null ? null : environment.getProperty("spring.datasource.username");
            String dsPass = environment == null ? null : environment.getProperty("spring.datasource.password");
            if (!org.springframework.util.StringUtils.hasText(dsUser)) {
                log.warn("数据库用户名未配置，将使用默认配置尝试连接");
            }
            if (!org.springframework.util.StringUtils.hasText(dsPass)) {
                log.warn("数据库密码未配置，将使用空密码尝试连接");
            }
        };
    }

    private static class RequestIdFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                @NonNull FilterChain filterChain)
                throws ServletException, IOException {
            String incoming = request.getHeader("X-Request-Id");
            String rid = incoming == null ? null : incoming.trim();
            if (rid == null || rid.isEmpty()) {
                rid = UUID.randomUUID().toString();
            }

            MDC.put("requestId", rid);
            response.setHeader("X-Request-Id", rid);
            try {
                filterChain.doFilter(request, response);
            } finally {
                MDC.remove("requestId");
            }
        }
    }

    private class HeaderAuthFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                @NonNull FilterChain filterChain)
                throws ServletException, IOException {
            if (!headerAuthEnabled || !isLocalRequest(request)) {
                filterChain.doFilter(request, response);
                return;
            }

            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                String userId = request.getHeader("X-User-Id");
                String username = decodeHeaderValue(request.getHeader("X-User-Name"));
                String role = decodeHeaderValue(request.getHeader("X-User-Role"));

                if (username != null && !username.isBlank()) {
                    List<GrantedAuthority> authorities = new ArrayList<>();
                    if (role != null && !role.isBlank()) {
                        String[] parts = role.split("[,;\\s]+");
                        for (String part : parts) {
                            if (part == null) {
                                continue;
                            }
                            String r = part.trim();
                            if (!r.isEmpty()) {
                                authorities.add(new SimpleGrantedAuthority("ROLE_" + r));
                            }
                        }
                    }
                    UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(username, userId,
                            authorities);
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
            filterChain.doFilter(request, response);
        }
    }

    @Override
    public void addInterceptors(@NonNull InterceptorRegistry registry) {
        registry.addInterceptor(new UserContextInterceptor());
    }

    // 将匿名内部类提取为静态内部类
    private class UserContextInterceptor implements HandlerInterceptor {
        @Override
        public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                @NonNull Object handler) {
            UserContext ctx = new UserContext();

            // 优先从TokenSubject获取完整用户信息（包括permissionRange）
            Object tokenSubjectAttr = request.getAttribute(TokenAuthFilter.TOKEN_SUBJECT_ATTR);
            if (tokenSubjectAttr instanceof TokenSubject) {
                TokenSubject subject = (TokenSubject) tokenSubjectAttr;
                ctx.setUserId(subject.getUserId());
                ctx.setUsername(subject.getUsername());
                ctx.setRole(subject.getRoleName());
                ctx.setPermissionRange(subject.getPermissionRange());
            } else {
                // 回退：从SecurityContext获取基本信息
                Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.isAuthenticated() && auth.getPrincipal() != null) {
                    ctx.setUsername(String.valueOf(auth.getPrincipal()));
                    ctx.setUserId(auth.getCredentials() == null ? null : String.valueOf(auth.getCredentials()));
                    ctx.setRole(extractRole(auth));
                    // 默认权限范围
                    ctx.setPermissionRange("all");
                } else if (headerAuthEnabled && isLocalRequest(request)) {
                    ctx.setUserId(request.getHeader("X-User-Id"));
                    ctx.setUsername(decodeHeaderValue(request.getHeader("X-User-Name")));
                    ctx.setRole(decodeHeaderValue(request.getHeader("X-User-Role")));
                    ctx.setPermissionRange(decodeHeaderValue(request.getHeader("X-Permission-Range")));
                }
            }
            UserContext.set(ctx);
            return true;
        }

        @Override
        public void afterCompletion(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                @NonNull Object handler, @Nullable Exception ex) {
            UserContext.clear();
        }
    }

    private static String extractRole(Authentication auth) {
        if (auth == null || auth.getAuthorities() == null) {
            return null;
        }
        StringBuilder sb = new StringBuilder();
        for (GrantedAuthority ga : auth.getAuthorities()) {
            if (ga == null) {
                continue;
            }
            String a = ga.getAuthority();
            if (a == null) {
                continue;
            }
            String t = a.trim();
            if (t.isEmpty()) {
                continue;
            }
            if (t.startsWith("ROLE_")) {
                t = t.substring(5);
            }
            if (t.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(t);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    private static String decodeHeaderValue(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        String s = raw.trim();
        boolean looksEncoded = false;
        for (int i = 0; i + 2 < s.length(); i++) {
            if (s.charAt(i) != '%') {
                continue;
            }
            char a = s.charAt(i + 1);
            char b = s.charAt(i + 2);
            boolean hexA = (a >= '0' && a <= '9') || (a >= 'a' && a <= 'f') || (a >= 'A' && a <= 'F');
            boolean hexB = (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F');
            if (hexA && hexB) {
                looksEncoded = true;
                break;
            }
        }
        if (!looksEncoded) {
            return raw;
        }
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return raw;
        }
    }

    private boolean isLocalRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        String ip = resolveClientIp(request);
        if (ip == null || ip.isBlank()) {
            return false;
        }
        String v = ip.trim();

        if (trustedIps != null && trustedIps.contains(v)) {
            return true;
        }

        if (trustedIpPrefixes != null) {
            for (String prefix : trustedIpPrefixes) {
                if (v.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String first = forwarded.split(",")[0];
            if (first != null && !first.isBlank()) {
                return first.trim();
            }
        }
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) {
            return real.trim();
        }
        return request.getRemoteAddr();
    }
}
