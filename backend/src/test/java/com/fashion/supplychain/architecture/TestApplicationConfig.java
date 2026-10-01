package com.fashion.supplychain.architecture;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

/**
 * 测试用 Spring 启动配置（D-698）
 *
 * <p><b>为什么不直接用默认的 {@code @SpringBootTest}</b>（自动扫主启动类）：
 * {@code WebSocketConfig.serverEndpointExporter()} 注册 {@code ServerEndpointExporter}，
 * 其创建要求容器内已有 {@code jakarta.websocket.server.ServerContainer}，
 * 而 {@code @SpringBootTest} 默认用 mock servlet 环境，<b>无真实 WS 容器</b>
 * → 上下文启动即抛 {@code ServerContainer not available}。
 *
 * <p>这是<b>测试环境的固有约束，非生产缺陷</b>（生产跑在真实 Tomcat 上有 WS 容器）。
 * 故只在测试配置里排除，<b>不改生产代码</b>。
 *
 * <p><b>关键：必须同时排除主启动类</b> {@code FashionSupplychainApplication}。
 * 它位于 {@code com.fashion.supplychain} 根包且自带 {@code @SpringBootApplication}，
 * 会被本配置的 {@code basePackages} 扫到并注册为 {@code @Configuration}，
 * 其内部的 {@code @ComponentScan} 会再扫一遍全包且<b>不带上我们的 excludeFilters</b>
 * → WebSocketConfig 仍被加载（实测踩过：仅排除 WebSocketConfig 无效）。
 *
 * <p><b>为何不用 {@code @SpringBootApplication}</b>：它自身已带一个
 * {@code @ComponentScan}，与此处显式声明的冲突，excludeFilters 不生效。
 * 故拆成三个注解显式组合。
 *
 * <p>本类为 public，供多个 {@code @SpringBootTest} 共享（避免每个测试重复一遍排除配置）。
 */
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(basePackages = "com.fashion.supplychain",
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                        classes = com.fashion.supplychain.config.WebSocketConfig.class),
                @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                        classes = com.fashion.supplychain.FashionSupplychainApplication.class)
        })
@MapperScan("com.fashion.supplychain.**.mapper")
public class TestApplicationConfig {
}
