package com.fashion.supplychain.config;

import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Flyway 10.x 版本格式修复 —— 程序化配置，不走 YAML 属性映射。
 *
 * 项目迁移文件使用时间戳格式（V202608051300），Flyway 10.x 默认 NUMERIC 拒绝。
 * flyway.conf 和 spring.flyway 属性在云端均未生效，直接 Java 代码在初始化前强制设 TIMESTAMP。
 */
@Configuration
public class FlywayVersionFormatConfig {

    @Bean
    public FlywayConfigurationCustomizer flywayVersionFormatCustomizer() {
        return (FluentConfiguration configuration) -> {
            configuration.sqlMigrationVersionFormat("TIMESTAMP");
        };
    }
}
