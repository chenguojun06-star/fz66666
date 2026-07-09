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
 * 历史教训：
 * 1. 2026-07-09 WebSocket 握手返回 500，根因是
 *    WebSocketHandshakeInterceptor（Configurator）的 authTokenService 永远为 null，
 *    因为 Tomcat 每次 new 的新实例不走 Spring 注入。
 * 2. 2026-07-09 改用 SpringContextHolder.getBean() 后生产环境仍 500，日志显示
 *    "ApplicationContext 未初始化"。根因是静态字段缺少 volatile 导致多线程可见性问题，
 *    以及单一 @Component 注入路径不可靠。
 *    修复：加 volatile + 提供 setApplicationContextStatic 供 WebSocketConfig 双重保险调用。
 */
@Component
public class SpringContextHolder implements ApplicationContextAware {

    // volatile 确保 Tomcat handler 线程能看到 Spring 初始化线程写入的值
    private static volatile ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        SpringContextHolder.applicationContext = applicationContext;
    }

    /**
     * 静态设置 ApplicationContext（供 WebSocketConfig 等 @Configuration 类双重保险调用）
     * 当本 Bean 因类加载器或扫描问题未实例化时，由其他一定会被扫描的 @Configuration 类兜底设置。
     */
    public static void setApplicationContextStatic(ApplicationContext context) {
        if (context != null) {
            SpringContextHolder.applicationContext = context;
        }
    }

    public static <T> T getBean(Class<T> clazz) {
        ApplicationContext ctx = applicationContext;
        if (ctx == null) {
            throw new IllegalStateException("ApplicationContext 未初始化，SpringContextHolder 尚未就绪");
        }
        return ctx.getBean(clazz);
    }

    public static Object getBean(String name) {
        ApplicationContext ctx = applicationContext;
        if (ctx == null) {
            throw new IllegalStateException("ApplicationContext 未初始化，SpringContextHolder 尚未就绪");
        }
        return ctx.getBean(name);
    }

    public static ApplicationContext getApplicationContext() {
        return applicationContext;
    }

    public static boolean isReady() {
        return applicationContext != null;
    }
}
