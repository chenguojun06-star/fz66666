package com.fashion.supplychain.config;

import com.fashion.supplychain.common.SpringContextHolder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.server.standard.ServerEndpointExporter;

/**
 * WebSocket 端点配置
 *
 * 仅注册 {@link ServerEndpointExporter} 以启用 {@link jakarta.websocket.server.ServerEndpoint}。
 * 注意：@ServerEndpoint 的 Configurator（如 {@link WebSocketHandshakeInterceptor}）由
 * Tomcat 容器实例化，不走 Spring 注入；其依赖通过 {@link SpringContextHolder}
 * 静态获取，不再在此处手动 Setter 注入（历史教训：2026-07-09 注入失效导致握手 500）。
 *
 * 双重保险：本类实现 {@link ApplicationContextAware}，在 Spring 容器启动时
 * 调用 {@link SpringContextHolder#setApplicationContextStatic} 确保静态字段被填充。
 * 这样即使 SpringContextHolder Bean 因类加载器或扫描问题未实例化，
 * 本 @Configuration 类也能兜底设置（历史教训：2026-07-09 单一注入路径导致生产环境 500）。
 */
@Slf4j
@Configuration
public class WebSocketConfig implements ApplicationContextAware {

    @Bean
    public ServerEndpointExporter serverEndpointExporter() {
        return new ServerEndpointExporter();
    }

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        // 双重保险：确保 SpringContextHolder 的静态字段被填充
        SpringContextHolder.setApplicationContextStatic(applicationContext);
        log.info("[WS] WebSocketConfig 已设置 SpringContextHolder.applicationContext，ready={}",
                 SpringContextHolder.isReady());
    }
}
