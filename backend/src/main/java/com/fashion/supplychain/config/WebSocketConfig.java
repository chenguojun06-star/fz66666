package com.fashion.supplychain.config;

import com.fashion.supplychain.auth.AuthTokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.server.standard.ServerEndpointExporter;

@Configuration
public class WebSocketConfig {

    @Autowired
    private WebSocketHandshakeInterceptor handshakeInterceptor;

    @Autowired
    private AuthTokenService authTokenService;

    @Bean
    public ServerEndpointExporter serverEndpointExporter() {
        ServerEndpointExporter exporter = new ServerEndpointExporter();
        // 注入AuthTokenService到Configurator（因为Configurator不由Spring管理）
        handshakeInterceptor.setAuthTokenService(authTokenService);
        return exporter;
    }
}
