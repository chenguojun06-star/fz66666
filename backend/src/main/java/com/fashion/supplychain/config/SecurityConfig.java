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

import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
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
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private UserInfoEnrichmentService userInfoEnrichmentService;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, AuthTokenService authTokenService,
                                            PermissionCalculationEngine permissionEngine) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                // JWT 无状态认证：禁止创建 Session，消除 JSESSIONID Cookie 及 SameSite 浏览器警告
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 安全响应头
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())                // 防止 Clickjacking
                        .contentTypeOptions(org.springframework.security.config.Customizer.withDefaults()) // X-Content-Type-Options: nosniff
                        .xssProtection(xss -> xss.headerValue(org.springframework.security.web.header.writers.XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK)) // X-XSS-Protection: 1; mode=block
                        .httpStrictTransportSecurity(hsts -> hsts
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31536000))                     // HSTS: 1年
                        .referrerPolicy(referrer -> referrer.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .permissionsPolicy(permissions -> permissions
                                .policy("camera=(), microphone=(), geolocation=()"))  // 禁止不需要的浏览器API
                )
                .authorizeHttpRequests(authz -> SecurityConfigHelper.configure(authz));

        // 未认证请求（token 缺失 / 过期）统一返回 401 JSON，前端拦截器据此跳转登录页
        // 有 token 但权限不足（403 Forbidden / AccessDeniedException）不在此处处理，保持默认 403
        http.exceptionHandling(ex -> ex.authenticationEntryPoint((req, res, e) -> {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"code\":401,\"message\":\"token已过期，请重新登录\"}");
        }));

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
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("Spring Security default user is disabled: " + username);
        };
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

            String piiKey = environment == null ? null : environment.getProperty("app.security.pii-encryption-key");
            String pk = piiKey == null ? "" : piiKey.trim();
            String activeProfile = environment == null ? "" : String.valueOf(environment.getProperty("spring.profiles.active", ""));
            boolean isProd = activeProfile.contains("prod");
            if (!org.springframework.util.StringUtils.hasText(pk) || "defaultKeyChangeMe12345678".equals(pk)
                    || (pk.startsWith("{{") && pk.endsWith("}}"))) {
                if (isProd) {
                    log.error("[Security] ⚠️ 生产环境 app.security.pii-encryption-key 未配置或使用占位值！PII加密使用内置默认密钥，建议通过 APP_PII_ENCRYPTION_KEY 环境变量配置专属密钥。服务正常运行但数据安全性降低。");
                } else {
                    log.warn("[Security] app.security.pii-encryption-key 未配置或使用占位值，PII加密将使用内置默认密钥（建议通过 APP_SECURITY_PII_ENCRYPTION_KEY 环境变量配置专属密钥）");
                }
            } else if (pk.length() < 24) {
                if (isProd) {
                    log.error("[Security] ⚠️ 生产环境 app.security.pii-encryption-key 长度仅{}位（建议至少24位），服务正常运行但数据安全性降低。", pk.length());
                } else {
                    log.warn("[Security] app.security.pii-encryption-key 长度仅{}位，建议至少24位以提高安全性", pk.length());
                }
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
        registry.addInterceptor(new HostCheckInterceptor()).order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE);
        registry.addInterceptor(new UserContextInterceptor());
    }

    private class HostCheckInterceptor implements HandlerInterceptor {
        @Override
        public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                 @NonNull Object handler) throws Exception {
            String host = request.getHeader("Host");
            // 屏蔽微信云托管的默认测试域名，强制要求走自定义域名或本地访问
            if (host != null && host.contains("tcloudbase.com")) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\": 403, \"msg\": \"Forbidden: Please use official domain\"}");
                return false;
            }
            return true;
        }
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
                if (subject.getFactoryId() != null) {
                    ctx.setFactoryId(subject.getFactoryId());
                }
                if (subject.getOrgUnitId() != null) {
                    ctx.setOrgUnitId(subject.getOrgUnitId());
                }

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

            // 修复：无论走 TokenAuth 还是 HeaderAuth，都需要补全 tenantId、isTenantOwner、isSuperAdmin 和 factoryId
            // 条件扩展：只要 userId 有效且非超管，始终经缓存确认 isTenantOwner（缓存 O(1)，无性能损耗）
            // 背景：旧 JWT 内嵌 tenantId/factoryId 非 null，原有 (tenantId==null||factoryId==null) 条件会短路跳过，
            //       导致 isTenantOwner 永远从 JWT 读到 false → isTopAdmin() 错误返回 false → 403
            if (ctx.getUserId() != null && !ctx.getSuperAdmin()) {
                try {
                    UserInfoEnrichmentService.EnrichmentResult result = userInfoEnrichmentService.enrichFromUserId(ctx.getUserId());
                    if (result != null) {
                        if (ctx.getTenantId() == null && result.tenantId != null) {
                            ctx.setTenantId(result.tenantId);
                        }
                        if (result.isTenantOwner != null) {
                            ctx.setTenantOwner(result.isTenantOwner);
                        }
                        if (result.isSuperAdmin != null) {
                            ctx.setSuperAdmin(result.isSuperAdmin);
                        }
                        if (result.factoryId != null) {
                            ctx.setFactoryId(result.factoryId);
                        }
                        if (result.wasCacheMiss) {
                            log.info("[UserContextInterceptor] 用户信息从 DB 补全: userId={}, tenantId={}, isTenantOwner={}, isSuperAdmin={}, factoryId={}",
                                    ctx.getUserId(), ctx.getTenantId(), ctx.getTenantOwner(), ctx.getSuperAdmin(), ctx.getFactoryId());
                        }
                    }
                } catch (Exception e) {
                    log.warn("[UserContextInterceptor] 补全用户租户信息失败, userId={}", ctx.getUserId(), e);
                }
            }

            if (ctx.getUserId() == null && !ctx.getSuperAdmin()
                    && org.springframework.util.StringUtils.hasText(ctx.getUsername())) {
                try {
                    UserInfoEnrichmentService.EnrichmentResult result = userInfoEnrichmentService.enrichFromUsername(ctx.getUsername());
                    if (result != null) {
                        if (result.userId != null) {
                            ctx.setUserId(result.userId);
                        }
                        if (ctx.getTenantId() == null && result.tenantId != null) {
                            ctx.setTenantId(result.tenantId);
                        }
                        if (result.isTenantOwner != null) {
                            ctx.setTenantOwner(result.isTenantOwner);
                        }
                        if (result.isSuperAdmin != null) {
                            ctx.setSuperAdmin(result.isSuperAdmin);
                        }
                        if (result.factoryId != null) {
                            ctx.setFactoryId(result.factoryId);
                        }
                        log.info("[UserContextInterceptor] username-fallback 补全: userId={}, username={}, tenantId={}, isTenantOwner={}, isSuperAdmin={}, factoryId={}",
                                ctx.getUserId(), ctx.getUsername(), ctx.getTenantId(), ctx.getTenantOwner(), ctx.getSuperAdmin(), ctx.getFactoryId());
                    }
                } catch (Exception e) {
                    log.warn("[UserContextInterceptor] username-fallback 补全失败, username={}", ctx.getUsername(), e);
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
        String remoteAddr = request.getRemoteAddr();
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        String remote = remoteAddr.trim();

        boolean isDirectLocal = "127.0.0.1".equals(remote) || "0:0:0:0:0:0:0:1".equals(remote) || "::1".equals(remote);
        if (isDirectLocal) {
            return true;
        }

        if (trustedIps != null && trustedIps.contains(remote)) {
            return true;
        }

        if (trustedIpPrefixes != null) {
            for (String prefix : trustedIpPrefixes) {
                if (remote.startsWith(prefix)) {
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
