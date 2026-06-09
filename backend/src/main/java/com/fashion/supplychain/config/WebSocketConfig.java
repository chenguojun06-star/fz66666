package com.fashion.supplychain.config;

import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.util.Map;

/**
 * WebSocket配置类
 * 配置WebSocket端点和处理器
 */
@Slf4j
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealTimeWebSocketHandler realTimeWebSocketHandler;

    @Value("${app.cors.allowed-origin-patterns:http://localhost:*}")
    private String allowedOriginPatterns;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(realTimeWebSocketHandler, "/ws/realtime")
                // 微信小程序不发 Origin header，需要允许无 Origin 的连接
                // "null" 模式匹配小程序等非浏览器客户端
                .setAllowedOriginPatterns(mergeMiniprogramOrigin())
                .setHandshakeHandler(new MiniprogramHandshakeHandler())
                .addInterceptors(new MiniprogramHandshakeInterceptor());
    }

    /**
     * 合并小程序 Origin 模式到允许列表
     * 微信小程序 WebSocket 请求不带 Origin header，Spring 会将其视为 "null"
     */
    private String[] mergeMiniprogramOrigin() {
        String[] original = allowedOriginPatterns.split(",");
        // 检查是否已包含通配符或 null 模式
        for (String pattern : original) {
            if ("*".equals(pattern.trim()) || "null".equals(pattern.trim())) {
                return original;
            }
        }
        // 追加 "null" 模式以允许小程序等无 Origin 客户端
        String[] merged = new String[original.length + 1];
        System.arraycopy(original, 0, merged, 0, original.length);
        merged[original.length] = "null";
        return merged;
    }

    /**
     * 微信小程序 WebSocket 握手拦截器
     * 记录小程序连接信息，便于排查问题
     */
    static class MiniprogramHandshakeInterceptor implements HandshakeInterceptor {
        @Override
        public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       WebSocketHandler wsHandler, Map<String, Object> attributes) {
            if (request instanceof ServletServerHttpRequest servletRequest) {
                String clientType = servletRequest.getServletRequest().getParameter("clientType");
                if ("miniprogram".equals(clientType)) {
                    String userId = servletRequest.getServletRequest().getParameter("userId");
                    log.info("[WebSocket] 小程序连接握手: userId={}", userId);
                    attributes.put("clientType", "miniprogram");
                }
            }
            return true;
        }

        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Exception exception) {
            // no-op
        }
    }

    /**
     * 自定义握手处理器
     * 覆盖 checkOrigin 以允许微信小程序等不带 Origin header 的客户端
     * 小程序 WebSocket 请求无 Origin，Spring 默认会拒绝
     */
    static class MiniprogramHandshakeHandler extends DefaultHandshakeHandler {
        @Override
        protected boolean isValidOrigin(ServerHttpRequest request) {
            // 微信小程序通过 clientType 参数标识，且无 Origin header
            if (request instanceof ServletServerHttpRequest servletRequest) {
                String clientType = servletRequest.getServletRequest().getParameter("clientType");
                if ("miniprogram".equals(clientType)) {
                    return true;
                }
            }
            return super.isValidOrigin(request);
        }
    }
}
