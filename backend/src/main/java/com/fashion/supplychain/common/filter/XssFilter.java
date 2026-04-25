package com.fashion.supplychain.common.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class XssFilter extends OncePerRequestFilter {

    private static final String[] EXCLUDED_PATHS = {
            "/api/auth/login",
            "/api/auth/register",
            "/actuator/",
            "/openapi/",
            "/swagger-ui/",
            "/v3/api-docs"
    };

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String uri = request.getRequestURI();
        for (String excluded : EXCLUDED_PATHS) {
            if (uri.startsWith(excluded)) {
                filterChain.doFilter(request, response);
                return;
            }
        }

        String contentType = request.getContentType();
        if (contentType != null && contentType.contains(MediaType.APPLICATION_JSON_VALUE)) {
            CachedBodyHttpServletRequest cachedRequest = new CachedBodyHttpServletRequest(request);
            String body = new String(cachedRequest.getBody(), StandardCharsets.UTF_8);
            if (XssHttpServletRequestWrapper.containsXssPattern(body)) {
                log.warn("[XssFilter] 拦截含XSS攻击的JSON请求体: uri={}, body长度={}", uri, body.length());
                sendXssBlockedResponse(response);
                return;
            }
            filterChain.doFilter(cachedRequest, response);
        } else {
            XssHttpServletRequestWrapper wrappedRequest = new XssHttpServletRequestWrapper(request);
            filterChain.doFilter(wrappedRequest, response);
        }
    }

    private void sendXssBlockedResponse(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        Map<String, Object> result = Map.of(
                "code", 400,
                "message", "请求包含不安全内容，已被拦截",
                "data", null
        );
        response.getWriter().write(objectMapper.writeValueAsString(result));
        response.getWriter().flush();
    }
}
