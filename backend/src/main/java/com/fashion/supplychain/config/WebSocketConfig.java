package com.fashion.supplychain.config;

import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket配置类
 * 配置WebSocket端点和处理器
 */
@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final RealTimeWebSocketHandler realTimeWebSocketHandler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(realTimeWebSocketHandler, "/ws/realtime")
                .setAllowedOriginPatterns(
                    "http://localhost:*",
                    "http://127.0.0.1:*",
                    "http://192.168.*:*",  // 内网
                    "http://10.*:*",       // 内网
                    "https://*.tcloudbase.com",  // 微信云托管
                    "https://*.sh.run.tcloudbase.com"  // 微信云托管
                );
    }
}
