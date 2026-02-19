package com.fashion.supplychain.config;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Tags;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.metrics.MeterRegistryCustomizer;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;

/**
 * 监控配置
 *
 * 提供以下监控能力：
 * 1. 应用指标监控（JVM、内存、线程等）
 * 2. 自定义健康检查
 * 3. 数据库连接池监控
 *
 * 监控端点：
 * - /actuator/health - 健康检查
 * - /actuator/metrics - 应用指标
 * - /actuator/prometheus - Prometheus格式（需引入micrometer-registry-prometheus）
 */
@Configuration
public class MonitoringConfig {

    @Value("${spring.application.name:supplychain}")
    private String applicationName;

    /**
     * 自定义Metrics标签
     * 为所有指标添加应用名称和环境标签
     */
    @Bean
    public MeterRegistryCustomizer<MeterRegistry> metricsCommonTags(
            @Value("${spring.profiles.active:dev}") String environment) {
        return registry -> registry.config().commonTags(
            Tags.of(
                Tag.of("application", applicationName),
                Tag.of("environment", environment)
            )
        );
    }

    /**
     * 数据库健康检查
     * 检查数据库连接是否正常
     */
    @Bean
    public HealthIndicator databaseHealthIndicator(DataSource dataSource) {
        return () -> {
            try (Connection connection = dataSource.getConnection()) {
                if (connection.isValid(1)) {
                    return Health.up()
                        .withDetail("database", "MySQL")
                        .withDetail("status", "连接正常")
                        .build();
                } else {
                    return Health.down()
                        .withDetail("database", "MySQL")
                        .withDetail("status", "连接异常")
                        .build();
                }
            } catch (Exception e) {
                return Health.down()
                    .withDetail("database", "MySQL")
                    .withDetail("error", e.getMessage())
                    .build();
            }
        };
    }

    /**
     * 缓存健康检查
     * 检查缓存服务是否正常
     */
    @Bean
    public HealthIndicator cacheHealthIndicator() {
        return () -> {
            try {
                // 本地缓存始终健康
                // 如果使用Redis，这里可以添加Redis连接检查
                return Health.up()
                    .withDetail("cache", "Local")
                    .withDetail("status", "正常")
                    .build();
            } catch (Exception e) {
                return Health.down()
                    .withDetail("cache", "Local")
                    .withDetail("error", e.getMessage())
                    .build();
            }
        };
    }

    /**
     * 应用信息健康检查
     * 提供应用基本信息
     */
    @Bean
    public HealthIndicator applicationHealthIndicator() {
        return () -> Health.up()
            .withDetail("application", applicationName)
            .withDetail("version", "0.0.1-SNAPSHOT")
            .withDetail("description", "服装供应链管理系统")
            .withDetail("javaVersion", System.getProperty("java.version"))
            .build();
    }
}
