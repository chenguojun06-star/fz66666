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
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
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
    private static final long TENANT_CACHE_TTL_MS = 5 * 60 * 1000L;
    private volatile long tenantCacheLastSweep = System.currentTimeMillis();
    private static final long TENANT_CACHE_SWEEP_INTERVAL_MS = 30 * 60 * 1000L;

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
                        .antMatchers("/ws/**").permitAll()  // WebSocket握手是HTTP升级请求，自行鉴权(userId query param)
                        .antMatchers("/error").permitAll()  // Spring Boot 错误转发端点，需放行否则自身产生 403 噪音日志
                        .antMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").authenticated()
                        .antMatchers("/api/system/tenant/apply").permitAll()
                        .antMatchers("/api/system/tenant/public-list").permitAll()
                        .antMatchers("/api/system/user/login").permitAll()
                        .antMatchers("/api/auth/login").permitAll()
                        .antMatchers("/api/auth/register").permitAll()
                        // 文件下载：旧公共下载保持 permitAll（无租户信息），租户隔离文件要求认证
                        // 前端通过 getAuthedFileUrl() 在 URL 追加 ?token=xxx，TokenAuthFilter 会解析
                        .antMatchers("/api/common/download/**").authenticated()
                        .antMatchers("/api/file/tenant-download/**").authenticated()
                        .antMatchers("/openapi/**").permitAll()  // 客户开放API（使用appKey+签名鉴权）
                        .antMatchers("/api/webhook/**").permitAll()  // 第三方回调（支付宝/微信支付/顺丰/申通），通过签名验证防伪造，不需要JWT
                        .antMatchers("/api/public/**").permitAll()   // 客户分享页等无需登录的公开查询接口
                        .antMatchers(HttpMethod.GET, "/api/production/warehousing/list").authenticated()
                        .antMatchers("/api/system/user/me*", "/api/system/user/me/**").authenticated()
                        .antMatchers("/api/system/user/permissions*", "/api/system/user/permissions/**").authenticated()
                        .antMatchers("/api/system/user/online-count").authenticated()
                        .antMatchers("/api/system/user/pending").hasAnyAuthority("ROLE_ADMIN", "ROLE_admin", "ROLE_1", "ROLE_tenant_owner", "ROLE_主管", "ROLE_管理员")
                        .antMatchers("/api/system/user/*/approve").hasAnyAuthority("ROLE_ADMIN", "ROLE_admin", "ROLE_1", "ROLE_tenant_owner", "ROLE_主管", "ROLE_管理员")
                        .antMatchers("/api/system/user/*/reject").hasAnyAuthority("ROLE_ADMIN", "ROLE_admin", "ROLE_1", "ROLE_tenant_owner", "ROLE_主管", "ROLE_管理员")
                        .antMatchers("/api/wechat/mini-program/login").permitAll()
                        .antMatchers("/api/wechat/h5/jssdk-config").permitAll()
                        .antMatchers("/api/wechat/h5/oauth-login").permitAll()
                        .antMatchers("/api/wechat/h5/bind-login").permitAll()
                        .antMatchers("/api/production/order/by-order-no/**").authenticated()
                        .antMatchers("/api/production/order/detail/**").authenticated()
                        .antMatchers("/api/production/cutting-bundle/by-no").authenticated()
                        .antMatchers("/api/production/cutting/summary").authenticated()
                        .antMatchers("/api/production/purchase/receive").authenticated()
                        .antMatchers("/api/production/material/receive").authenticated()
                        .antMatchers("/api/production/order/node-operations/**").authenticated()
                        .antMatchers("/actuator/health", "/actuator/health/**", "/actuator/info", "/actuator/info/**")
                        .permitAll()
                        .antMatchers("/api/warehouse/dashboard/**").authenticated()
                        .antMatchers("/actuator/**").hasAnyAuthority(
                                "ROLE_ADMIN",
                                "ROLE_admin",
                                "ROLE_1",
                                "ROLE_主管",
                                "ROLE_管理员")
                        .antMatchers("/api/system/diag/**").hasAnyAuthority(
                                "ROLE_ADMIN",
                                "ROLE_admin",
                                "ROLE_1",
                                "ROLE_主管",
                                "ROLE_管理员")
                        .antMatchers("/api/system/serial/**").authenticated()
                        .antMatchers("/api/system/tenant/my").authenticated()
                        .antMatchers("/api/system/tenant/sub/**").authenticated()
                        .antMatchers("/api/system/tenant/role-templates").authenticated()
                        .antMatchers("/api/system/tenant/roles/**").authenticated()
                        .antMatchers("/api/system/tenant/registration/**").permitAll()
                        .antMatchers("/api/system/tenant/registrations/**").authenticated()

                        // ── 系统模块只读端点：所有登录用户可访问（必须放在 /api/system/** 兜底之前）──
                        // 用户列表：工厂账号可查自己工厂成员（Orchestrator 层自动按 factoryId 过滤，防越权）
                        .antMatchers(HttpMethod.GET, "/api/system/user/list").authenticated()
                        // 成员状态切换：工厂账号可启停自己工厂成员（Orchestrator 层校验 factoryId 归属，防越权）
                        .antMatchers(HttpMethod.PUT, "/api/system/user/status").authenticated()
                        // 组织架构：查看部门树/成员（创建/修改/删除由兜底规则限定为管理员）
                        .antMatchers(HttpMethod.GET, "/api/system/organization/tree").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/organization/departments").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/organization/members").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/organization/assignable-users").authenticated()
                        // 工厂：查看列表/详情（创建/修改/删除由兜底规则限定为管理员）
                        .antMatchers(HttpMethod.GET, "/api/system/factory/list").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/factory/*").authenticated()
                        // 应用商店：浏览、我的应用、试用（admin 端点有 method 级 @PreAuthorize 二次拦截）
                        .antMatchers("/api/system/app-store/list").authenticated()
                        .antMatchers("/api/system/app-store/my-apps").authenticated()
                        .antMatchers("/api/system/app-store/my-subscriptions").authenticated()
                        .antMatchers("/api/system/app-store/start-trial").authenticated()
                        .antMatchers("/api/system/app-store/create-order").authenticated()
                        .antMatchers("/api/system/app-store/quick-setup").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/app-store/trial-status/**").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/app-store/*").authenticated()
                        // 租户智能配置/功能开关（查看当前租户配置；save/reset 由兜底规则限为管理员）
                        .antMatchers(HttpMethod.GET, "/api/system/tenant-intelligence-profile/current").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/tenant-smart-feature/list").authenticated()
                        // 字典查询：工序名/机器类型等词典数据，前端下拉/自动完成组件需要，所有登录用户可读
                        // （写操作 POST/PUT/DELETE 由兜底规则限为管理员）
                        .antMatchers(HttpMethod.GET, "/api/system/dict/list").authenticated()
                        .antMatchers(HttpMethod.GET, "/api/system/dict/by-type").authenticated()

                        // 订单备注：所有登录用户可读写自己租户的订单备注（Orchestrator 层按 tenantId 隔离）
                        .antMatchers("/api/system/order-remark/**").authenticated()

                        // ── 管理员兜底：/api/system/tenant/** 和 /api/system/** 其余端点仅管理员可访问 ──
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
            if (ctx.getUserId() != null && jdbcTemplate != null && !ctx.getSuperAdmin()) {
                String cacheKey = "u:" + ctx.getUserId();
                String cached = getTenantCache(cacheKey);
                boolean isOldCache = cached != null && (cached.split("\\|", -1).length < 4 || "".equals(cached.split("\\|", -1)[3]));
                boolean shouldRefreshFromDb = cached == null || isOldCache;
                boolean wasCacheMiss = (cached == null);
                if (shouldRefreshFromDb) {
                    try {
                        List<String> rows = jdbcTemplate.query(
                            "SELECT tenant_id, is_tenant_owner, is_super_admin, factory_id FROM t_user WHERE id = ? LIMIT 1",
                            (rs, i) -> {
                                Long tid = rs.getObject(1, Long.class);
                                Boolean owner = rs.getObject(2) != null && rs.getInt(2) == 1;
                                Boolean superAdm = rs.getObject(3) != null && rs.getInt(3) == 1;
                                String fid = rs.getString(4);
                                return (tid == null ? "" : tid.toString()) + "|" + owner + "|" + superAdm + "|" + (fid == null ? "null" : fid);
                            },
                            Long.parseLong(ctx.getUserId())
                        );
                        if (!rows.isEmpty()) {
                            cached = rows.get(0);
                            putTenantCache(cacheKey, cached);
                        }
                    } catch (Exception e) {
                        log.warn("[UserContextInterceptor] 补全用户租户信息失败, userId={}", ctx.getUserId(), e);
                    }
                }
                if (cached != null) {
                    String[] parts = cached.split("\\|", -1);
                    if (ctx.getTenantId() == null && !parts[0].isEmpty()) {
                        ctx.setTenantId(Long.parseLong(parts[0]));
                    }
                    if (parts.length > 1 && !parts[1].isEmpty()) {
                        ctx.setTenantOwner(Boolean.parseBoolean(parts[1]));
                    }
                    if (parts.length > 2 && !parts[2].isEmpty()) {
                        ctx.setSuperAdmin(Boolean.parseBoolean(parts[2]));
                    }
                    if (parts.length > 3 && org.springframework.util.StringUtils.hasText(parts[3]) && !"null".equals(parts[3])) {
                        ctx.setFactoryId(parts[3].trim());
                    }
                    if (wasCacheMiss) {
                        log.info("[UserContextInterceptor] 用户信息从 DB 补全: userId={}, tenantId={}, isTenantOwner={}, isSuperAdmin={}, factoryId={}",
                                ctx.getUserId(), ctx.getTenantId(), ctx.getTenantOwner(), ctx.getSuperAdmin(), ctx.getFactoryId());
                    }

                    // 自愈修复：租户主账号 t_user.tenant_id 为 NULL 时，从 t_tenant 表反查并回填
                    // （V20260323 迁移脚本会批量修复存量数据，此处处理极端情况或迁移前的首次登录）
                    if (ctx.getTenantId() == null && Boolean.TRUE.equals(ctx.getTenantOwner()) && !ctx.getSuperAdmin()) {
                        try {
                            List<Long> tids = jdbcTemplate.query(
                                "SELECT id FROM t_tenant WHERE owner_user_id = ? LIMIT 1",
                                (rs, i) -> rs.getLong(1),
                                Long.parseLong(ctx.getUserId())
                            );
                            if (!tids.isEmpty()) {
                                Long recoveredTenantId = tids.get(0);
                                ctx.setTenantId(recoveredTenantId);
                                // 顺手修复 t_user 数据，避免下次请求再次触发此逻辑
                                jdbcTemplate.update(
                                    "UPDATE t_user SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL",
                                    recoveredTenantId, Long.parseLong(ctx.getUserId())
                                );
                                invalidateTenantCache("u:" + ctx.getUserId());
                                log.warn("[UserContextInterceptor] 自愈修复: 租户主 userId={} tenant_id 已回填为 {}（请检查 V20260323 迁移是否已执行）",
                                        ctx.getUserId(), recoveredTenantId);
                            } else {
                                log.error("[UserContextInterceptor] 严重: 租户主 userId={} 在 t_tenant 中找不到对应记录，数据异常，用户将看不到业务数据!",
                                        ctx.getUserId());
                            }
                        } catch (Exception e) {
                            log.error("[UserContextInterceptor] 自愈查询失败 userId={}", ctx.getUserId(), e);
                        }
                    }

                    // [2026-07-20 修复] 非owner普通用户 tenant_id 为 NULL 时，从同组织/同工厂的其他用户反查 tenant_id
                    if (ctx.getTenantId() == null && !Boolean.TRUE.equals(ctx.getTenantOwner()) && !ctx.getSuperAdmin()) {
                        try {
                            Long recoveredTenantId = null;
                            String userId = ctx.getUserId();
                            // 策略1：从同 org_unit_id 的其他用户获取 tenant_id
                            List<Long> tids = jdbcTemplate.query(
                                "SELECT DISTINCT u2.tenant_id FROM t_user u1 JOIN t_user u2 ON u1.org_unit_id = u2.org_unit_id " +
                                        "WHERE u1.id = ? AND u1.org_unit_id IS NOT NULL AND u2.tenant_id IS NOT NULL LIMIT 1",
                                (rs, i) -> rs.getLong(1), Long.parseLong(userId)
                            );
                            if (!tids.isEmpty()) {
                                recoveredTenantId = tids.get(0);
                            }
                            // 策略2：从同 factory_id 的其他用户获取 tenant_id
                            if (recoveredTenantId == null && org.springframework.util.StringUtils.hasText(ctx.getFactoryId())) {
                                tids = jdbcTemplate.query(
                                    "SELECT DISTINCT tenant_id FROM t_user WHERE factory_id = ? AND tenant_id IS NOT NULL LIMIT 1",
                                    (rs, i) -> rs.getLong(1), ctx.getFactoryId()
                                );
                                if (!tids.isEmpty()) {
                                    recoveredTenantId = tids.get(0);
                                }
                            }
                            // 策略3：从同 role_id 的其他用户获取 tenant_id（最后兜底）
                            if (recoveredTenantId == null) {
                                tids = jdbcTemplate.query(
                                    "SELECT DISTINCT u2.tenant_id FROM t_user u1 JOIN t_user u2 ON u1.role_id = u2.role_id " +
                                            "WHERE u1.id = ? AND u2.tenant_id IS NOT NULL AND u2.id != u1.id LIMIT 1",
                                    (rs, i) -> rs.getLong(1), Long.parseLong(userId)
                                );
                                if (!tids.isEmpty()) {
                                    recoveredTenantId = tids.get(0);
                                }
                            }
                            if (recoveredTenantId != null) {
                                ctx.setTenantId(recoveredTenantId);
                                jdbcTemplate.update(
                                    "UPDATE t_user SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL",
                                    recoveredTenantId, Long.parseLong(userId)
                                );
                                invalidateTenantCache("u:" + userId);
                                log.warn("[UserContextInterceptor] 非owner用户自愈: userId={} tenant_id 已回填为 {}",
                                        userId, recoveredTenantId);
                            } else {
                                log.error("[UserContextInterceptor] 严重: 非owner用户 userId={} 无法推断 tenant_id，该用户将看不到任何业务数据!",
                                        userId);
                            }
                        } catch (Exception e) {
                            log.error("[UserContextInterceptor] 非owner用户自愈查询失败 userId={}", ctx.getUserId(), e);
                        }
                    }
                }
            }

            // [2026-03-21 修复] 旧JWT无uid字段（userId=null）时，降级用 username 查询 DB 补全 isTenantOwner 等
            // 根因：userId=null → 原有 DB fallback 条件 ctx.getUserId()!=null 短路跳过 → isTenantOwner 无法加载
            // 症状：租户主账号在前端（从用户资料API正确读到isTenantOwner=true）能点击按钮，
            //       但后端 UserContext.isTopAdmin() 返回 false → 403
            if (ctx.getUserId() == null && jdbcTemplate != null && !ctx.getSuperAdmin()
                    && org.springframework.util.StringUtils.hasText(ctx.getUsername())) {
                String cacheKey = "u:" + ctx.getUsername();
                String cached = getTenantCache(cacheKey);
                boolean isOldCache = cached != null && (cached.split("\\|", -1).length < 5 || "".equals(cached.split("\\|", -1)[4]));
                if (cached == null || isOldCache) {
                    try {
                        List<String> rows = jdbcTemplate.query(
                            "SELECT id, tenant_id, is_tenant_owner, is_super_admin, factory_id FROM t_user " +
                                    "WHERE username = ? OR name = ? ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END LIMIT 1",
                            (rs, i) -> {
                                long uid = rs.getLong(1);
                                Long tid = rs.getObject(2, Long.class);
                                Boolean owner = rs.getObject(3) != null && rs.getInt(3) == 1;
                                Boolean superAdm = rs.getObject(4) != null && rs.getInt(4) == 1;
                                String fid = rs.getString(5);
                                return uid + "|" + (tid == null ? "" : tid) + "|" + owner + "|" + superAdm + "|" + (fid == null ? "null" : fid);
                            },
                            ctx.getUsername(),
                            ctx.getUsername(),
                            ctx.getUsername()
                        );
                        if (!rows.isEmpty()) {
                            cached = rows.get(0);
                            putTenantCache(cacheKey, cached);
                        }
                    } catch (Exception e) {
                        log.warn("[UserContextInterceptor] username-fallback 补全失败, username={}", ctx.getUsername(), e);
                    }
                }
                if (cached != null) {
                    String[] parts = cached.split("\\|", -1);
                    // parts: [0]=id, [1]=tenantId, [2]=isTenantOwner, [3]=isSuperAdmin, [4]=factoryId
                    if (parts.length > 0 && !parts[0].isEmpty()) {
                        ctx.setUserId(parts[0]);  // 旧JWT缺失uid字段时从DB补齐
                    }
                    if (ctx.getTenantId() == null && parts.length > 1 && !parts[1].isEmpty()) {
                        ctx.setTenantId(Long.parseLong(parts[1]));
                    }
                    if (parts.length > 2 && !parts[2].isEmpty()) {
                        ctx.setTenantOwner(Boolean.parseBoolean(parts[2]));
                    }
                    if (parts.length > 3 && !parts[3].isEmpty()) {
                        ctx.setSuperAdmin(Boolean.parseBoolean(parts[3]));
                    }
                    if (parts.length > 4 && org.springframework.util.StringUtils.hasText(parts[4]) && !"null".equals(parts[4])) {
                        ctx.setFactoryId(parts[4].trim());
                    }
                    log.info("[UserContextInterceptor] username-fallback 补全: userId={}, username={}, tenantId={}, isTenantOwner={}, isSuperAdmin={}, factoryId={}",
                            ctx.getUserId(), ctx.getUsername(), ctx.getTenantId(), ctx.getTenantOwner(), ctx.getSuperAdmin(), ctx.getFactoryId());
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

    private String getTenantCache(String key) {
        String raw = tenantInfoCache.get(key);
        if (raw == null) {
            return null;
        }
        int sep = raw.indexOf('|');
        if (sep <= 0) {
            tenantInfoCache.remove(key);
            return null;
        }
        try {
            long ts = Long.parseLong(raw.substring(0, sep));
            if (System.currentTimeMillis() - ts > TENANT_CACHE_TTL_MS) {
                tenantInfoCache.remove(key);
                return null;
            }
            return raw.substring(sep + 1);
        } catch (NumberFormatException e) {
            tenantInfoCache.remove(key);
            return null;
        }
    }

    private void putTenantCache(String key, String value) {
        tenantInfoCache.put(key, System.currentTimeMillis() + "|" + value);
        sweepTenantCacheIfNeeded();
    }

    private void invalidateTenantCache(String key) {
        tenantInfoCache.remove(key);
    }

    private void sweepTenantCacheIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - tenantCacheLastSweep < TENANT_CACHE_SWEEP_INTERVAL_MS) {
            return;
        }
        tenantCacheLastSweep = now;
        for (Map.Entry<String, String> entry : tenantInfoCache.entrySet()) {
            String raw = entry.getValue();
            if (raw == null) {
                continue;
            }
            int sep = raw.indexOf('|');
            if (sep <= 0) {
                tenantInfoCache.remove(entry.getKey());
                continue;
            }
            try {
                long ts = Long.parseLong(raw.substring(0, sep));
                if (now - ts > TENANT_CACHE_TTL_MS) {
                    tenantInfoCache.remove(entry.getKey());
                }
            } catch (NumberFormatException e) {
                tenantInfoCache.remove(entry.getKey());
            }
        }
    }
}
