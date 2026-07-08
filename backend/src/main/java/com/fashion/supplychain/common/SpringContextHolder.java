package com.fashion.supplychain.common;

import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * Spring 上下文静态持有器
 *
 * 用途：解决 JSR-356 {@link jakarta.websocket.server.ServerEndpoint} 实例由
 * Tomcat 容器创建（非 Spring 管理）导致 @Autowired 注入失效的问题。
 * @ServerEndpoint 的 Configurator 和 Endpoint 实例可通过本类静态获取 Bean。
 *
 * 历史教训：2026-07-09 WebSocket 握手返回 500，根因是
 * WebSocketHandshakeInterceptor（Configurator）的 authTokenService 永远为 null，
 * 因为 Tomcat 每次 new 的新实例不走 Spring 注入。
 */
@Component
public class SpringContextHolder implements ApplicationContextAware {

    private static ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        SpringContextHolder.applicationContext = applicationContext;
    }

    public static <T> T getBean(Class<T> clazz) {
        if (applicationContext == null) {
            throw new IllegalStateException("ApplicationContext 未初始化，SpringContextHolder 尚未就绪");
        }
        return applicationContext.getBean(clazz);
    }

    public static Object getBean(String name) {
        if (applicationContext == null) {
            throw new IllegalStateException("ApplicationContext 未初始化，SpringContextHolder 尚未就绪");
        }
        return applicationContext.getBean(name);
    }

    public static ApplicationContext getApplicationContext() {
        return applicationContext;
    }
}
