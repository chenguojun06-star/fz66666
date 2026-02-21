package com.fashion.supplychain.config;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenAuthFilter;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
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
import java.util.concurrent.ConcurrentHashMap;

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

    /** 修复：旧 JWT 不含 tenantId 时，从 DB 自动补全 《 userId → tenantId》的简单内存缓存 */
    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;
    private final ConcurrentHashMap<String, String> tenantInfoCache = new ConcurrentHashMap<>();

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, AuthTokenService authTokenService,
                                            PermissionCalculationEngine permissionEngine) throws Exception {
        http
                .cors().and()
                .csrf().disable()
                // 安全响应头
                .headers(headers -> headers
                        .frameOptions().deny()                              // 防止 Clickjacking
                        .contentTypeOptions()                               // X-Content-Type-Options: nosniff
                        .and()
                        .xssProtection().block(true)                        // X-XSS-Protection: 1; mode=block
                        .and()
                        .httpStrictTransportSecurity()
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31536000)                      // HSTS: 1年
                        .and()
                        .referrerPolicy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
                        .and()
                        .permissionsPolicy(permissions -> permissions
                                .policy("camera=(), microphone=(), geolocation=()"))  // 禁止不需要的浏览器API
                )
                .authorizeHttpRequests(authz -> authz
                        .antMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .antMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .antMatchers("/api/system/tenant/apply").permitAll()
                        .antMatchers("/api/system/tenant/public-list").permitAll()
                        .antMatchers("/api/system/user/login").permitAll()
                        .antMatchers("/api/auth/login").permitAll()
                        .antMatchers("/api/auth/user-info").permitAll()
                        .antMatchers("/api/auth/register").permitAll()
                        // 文件下载：旧公共下载保持 permitAll（无租户信息），租户隔离文件要求认证
                        // 前端通过 getAuthedFileUrl() 在 URL 追加 ?token=xxx，TokenAuthFilter 会解析
                        .antMatchers("/api/common/download/**").permitAll()
                        .antMatchers("/api/file/tenant-download/**").authenticated()
                        .antMatchers("/openapi/**").permitAll()  // 客户开放API（使用appKey+签名鉴权）
                        .antMatchers(HttpMethod.GET, "/api/production/warehousing/list").authenticated()
                        .antMatchers("/api/system/user/me*", "/api/system/user/me/**").authenticated()
                        .antMatchers("/api/system/user/permissions*", "/api/system/user/permissions/**").authenticated()
                        .antMatchers("/api/system/user/online-count").authenticated()
                        .antMatchers("/api/system/user/pending").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1", "ROLE_tenant_owner")
                        .antMatchers("/api/system/user/*/approve").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1", "ROLE_tenant_owner")
                        .antMatchers("/api/system/user/*/reject").hasAnyAuthority("ROLE_admin", "ROLE_ADMIN", "ROLE_1", "ROLE_tenant_owner")
                        .antMatchers("/api/wechat/mini-program/login").permitAll()
                        .antMatchers("/api/production/order/by-order-no/**").authenticated()
                        .antMatchers("/api/production/order/detail/**").authenticated()
                        .antMatchers("/api/production/cutting-bundle/by-no").authenticated()
                        .antMatchers("/api/production/cutting/summary").authenticated()
                        .antMatchers("/api/production/purchase/receive").authenticated()
                        .antMatchers("/api/production/material/receive").authenticated()
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
                        .antMatchers("/api/system/tenant/my").authenticated()
                        .antMatchers("/api/system/tenant/sub/**").authenticated()
                        .antMatchers("/api/system/tenant/role-templates").authenticated()
                        .antMatchers("/api/system/tenant/roles/**").authenticated()
                        .antMatchers("/api/system/tenant/registration/**").permitAll()
                        .antMatchers("/api/system/tenant/registrations/**").authenticated()
                        .antMatchers("/api/system/tenant/**").hasAnyAuthority(
                                "ROLE_admin",
                                "ROLE_ADMIN",
                                "ROLE_1",
                                "ROLE_tenant_owner")
                        .antMatchers("/api/system/**").hasAnyAuthority(
                                "ROLE_admin",
                                "ROLE_ADMIN",
                                "ROLE_1",
                                "ROLE_tenant_owner")
                        .antMatchers("/api/**").authenticated()
                        .anyRequest().denyAll());

        http.addFilterBefore(new TokenAuthFilter(authTokenService, permissionEngine, stringRedisTemplate), UsernamePasswordAuthenticationFilter.class);
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
                ctx.setTenantId(subject.getTenantId());
                ctx.setTenantOwner(subject.isTenantOwner());
                ctx.setSuperAdmin(subject.isSuperAdmin());

            } else {
                // 回退：从SecurityContext获取基本信息
                Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                if (auth != null && auth.isAuthenticated() && auth.getPrincipal() != null) {
                    String principal = String.valueOf(auth.getPrincipal());
                    // ✅ 过滤 Spring Security 默认的 anonymousUser（Header认证缺失时产生）
                    if (principal != null && !"anonymousUser".equals(principal)) {
                        ctx.setUsername(principal);
                        ctx.setUserId(auth.getCredentials() == null ? null : String.valueOf(auth.getCredentials()));
                        ctx.setRole(extractRole(auth));
                        // 默认权限范围
                        ctx.setPermissionRange("all");
                    }
                } else if (headerAuthEnabled && isLocalRequest(request)) {
                    ctx.setUserId(request.getHeader("X-User-Id"));
                    ctx.setUsername(decodeHeaderValue(request.getHeader("X-User-Name")));
                    ctx.setRole(decodeHeaderValue(request.getHeader("X-User-Role")));
                    ctx.setPermissionRange(decodeHeaderValue(request.getHeader("X-Permission-Range")));
                }
            }

            // 修复：无论走 TokenAuth 还是 HeaderAuth，都需要补全 tenantId、isTenantOwner 和 isSuperAdmin
            if (ctx.getUserId() != null && jdbcTemplate != null && ctx.getTenantId() == null && !ctx.getSuperAdmin()) {
                String cacheKey = ctx.getUserId();
                // 缓存结构：tenantId + "|" + isTenantOwner + "|" + isSuperAdmin
                String cached = tenantInfoCache.get(cacheKey);
                if (cached == null) {
                    try {
                        List<String> rows = jdbcTemplate.query(
                            "SELECT tenant_id, is_tenant_owner, is_super_admin FROM t_user WHERE id = ? LIMIT 1",
                            (rs, i) -> {
                                Long tid = rs.getObject(1, Long.class);
                                Boolean owner = rs.getObject(2) != null && rs.getInt(2) == 1;
                                Boolean superAdm = rs.getObject(3) != null && rs.getInt(3) == 1;
                                return (tid == null ? "" : tid.toString()) + "|" + owner + "|" + superAdm;
                            },
                            Long.parseLong(ctx.getUserId())
                        );
                        if (!rows.isEmpty()) {
                            cached = rows.get(0);
                            tenantInfoCache.put(cacheKey, cached);
                        }
                    } catch (Exception e) {
                        log.warn("[UserContextInterceptor] 补全用户租户信息失败, userId={}", ctx.getUserId(), e);
                    }
                }
                if (cached != null) {
                    String[] parts = cached.split("\\|", 3);
                    if (ctx.getTenantId() == null && !parts[0].isEmpty()) {
                        ctx.setTenantId(Long.parseLong(parts[0]));
                    }
                    if (parts.length > 1) {
                        ctx.setTenantOwner(Boolean.parseBoolean(parts[1]));
                    }
                    if (parts.length > 2) {
                        ctx.setSuperAdmin(Boolean.parseBoolean(parts[2]));
                    }
                    log.info("[UserContextInterceptor] 用户信息从 DB 补全: userId={}, tenantId={}, isTenantOwner={}, isSuperAdmin={}",
                            ctx.getUserId(), ctx.getTenantId(), ctx.getTenantOwner(), ctx.getSuperAdmin());
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
