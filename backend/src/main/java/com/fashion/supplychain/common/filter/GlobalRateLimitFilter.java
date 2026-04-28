package com.fashion.supplychain.common.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class GlobalRateLimitFilter extends OncePerRequestFilter {

    private static final String LUA_SCRIPT =
            "local key = KEYS[1] " +
            "local limit = tonumber(ARGV[1]) " +
            "local window = tonumber(ARGV[2]) " +
            "local current = tonumber(redis.call('get', key) or '0') " +
            "if current >= limit then " +
            "  return current " +
            "end " +
            "current = redis.call('incr', key) " +
            "if current == 1 then " +
            "  redis.call('expire', key, window) " +
            "end " +
            "return current";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Value("${app.rate-limit.default-max-requests:200}")
    private int defaultMaxRequests;

    @Value("${app.rate-limit.default-window-seconds:60}")
    private int defaultWindowSeconds;

    private static final List<String> EXCLUDED_PATHS = List.of(
            "/api/auth/login",
            "/api/production/scan",
            "/api/production/cutting",
            "/api/production/quality",
            "/api/production/warehouse",
            "/api/production/warehousing",
            "/api/production/pattern",
            "/api/production/order/transfer",
            "/api/production/factory-shipment",
            "/api/production/process-tracking",
            "/ws/",
            "/actuator/",
            "/openapi/",
            "/swagger-ui/",
            "/v3/api-docs",
            "/.well-known/"
    );

    private static final List<RateLimitRule> RULES = List.of(
            new RateLimitRule("/api/intelligence/ai-advisor", "ai", 30, 60),
            new RateLimitRule("/api/production/order/export", "export", 10, 60),
            new RateLimitRule("/api/finance/tax-export", "export", 10, 60),
            new RateLimitRule("/api/auth/register", "register", 5, 3600)
    );

    public GlobalRateLimitFilter(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!enabled) {
            filterChain.doFilter(request, response);
            return;
        }

        String uri = request.getRequestURI();
        for (String excluded : EXCLUDED_PATHS) {
            if (uri.startsWith(excluded)) {
                filterChain.doFilter(request, response);
                return;
            }
        }

        String clientId = resolveClientId(request);
        RateLimitRule matchedRule = findMatchingRule(uri);

        String key = "rl:global:" + matchedRule.category + ":" + clientId;
        int maxRequests = matchedRule.maxRequests;
        int windowSeconds = matchedRule.windowSeconds;

        try {
            DefaultRedisScript<Long> script = new DefaultRedisScript<>(LUA_SCRIPT, Long.class);
            Long current = redisTemplate.execute(script,
                    Collections.singletonList(key),
                    String.valueOf(maxRequests),
                    String.valueOf(windowSeconds));

            if (current != null && current > maxRequests) {
                log.warn("[GlobalRateLimit] 限流触发: key={}, current={}/{}per{}s, uri={}",
                        key, current, maxRequests, windowSeconds, uri);
                sendRateLimitResponse(response, maxRequests, windowSeconds);
                return;
            }

            if (current != null) {
                response.setHeader("X-RateLimit-Limit", String.valueOf(maxRequests));
                response.setHeader("X-RateLimit-Remaining", String.valueOf(Math.max(0, maxRequests - current)));
                response.setHeader("X-RateLimit-Reset", String.valueOf(windowSeconds));
            }
        } catch (Exception e) {
            log.warn("[GlobalRateLimit] Redis异常，放行请求(fail-open): key={}, error={}", key, e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private String resolveClientId(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        return request.getRemoteAddr();
    }

    private RateLimitRule findMatchingRule(String uri) {
        for (RateLimitRule rule : RULES) {
            if (uri.startsWith(rule.pathPrefix)) {
                return rule;
            }
        }
        return new RateLimitRule("/api/", "default", defaultMaxRequests, defaultWindowSeconds);
    }

    private void sendRateLimitResponse(HttpServletResponse response, int maxRequests, int windowSeconds)
            throws IOException {
        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Retry-After", String.valueOf(windowSeconds));
        Map<String, Object> result = Map.of(
                "code", 429,
                "message", "请求过于频繁，请稍后再试（限制" + maxRequests + "次/" + windowSeconds + "秒）",
                "data", null
        );
        response.getWriter().write(objectMapper.writeValueAsString(result));
        response.getWriter().flush();
    }

    record RateLimitRule(String pathPrefix, String category, int maxRequests, int windowSeconds) {}
}
