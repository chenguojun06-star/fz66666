package com.fashion.supplychain.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.server.standard.ServerEndpointExporter;

/**
 * WebSocket 端点配置
 *
 * 仅注册 {@link ServerEndpointExporter} 以启用 {@link jakarta.websocket.server.ServerEndpoint}。
 * 注意：@ServerEndpoint 的 Configurator（如 {@link WebSocketHandshakeInterceptor}）由
 * Tomcat 容器实例化，不走 Spring 注入；其依赖通过 {@link com.fashion.supplychain.common.SpringContextHolder}
 * 静态获取，不再在此处手动 Setter 注入（历史教训：2026-07-09 注入失效导致握手 500）。
 */
@Configuration
public class WebSocketConfig {

    @Bean
    public ServerEndpointExporter serverEndpointExporter() {
        return new ServerEndpointExporter();
    }
}
