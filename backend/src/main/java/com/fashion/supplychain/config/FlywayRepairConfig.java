package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

    /**
     * Flyway 10.x 默认要求版本号包含点号（如 1.0.0），
     * 但项目使用时间戳版本（如 V202606051300）。
     * 配置 sqlMigrationVersionFormat 使 Flyway 支持纯数字时间戳版本。
     */
    @Bean
    FlywayConfigurationCustomizer flywayVersionCustomizer() {
        return (FluentConfiguration configuration) -> {
            configuration.configuration(Map.of(
                "flyway.sqlMigrationVersionFormat", "yyyyMMddHHmm"
            ));
            log.info("[FlywayRepair] 已配置 Flyway 版本格式: yyyyMMddHHmm");
        };
    }

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            log.info("[FlywayRepair] Running repair...");
            try {
                flyway.repair();
            } catch (Exception e) {
                log.warn("[FlywayRepair] Repair failed, continue: {}", e.getMessage());
            }

            try {
                flyway.migrate();
                log.info("[FlywayRepair] Migrate complete.");
            } catch (Exception e) {
                log.error("[FlywayRepair] Migrate 失败，应用继续启动。详情: {}", e.getMessage());
                Throwable cause = e.getCause();
                int depth = 0;
                while (cause != null && depth < 5) {
                    log.error("[FlywayRepair] 根因[{}]: {}", depth, cause.getMessage());
                    cause = cause.getCause();
                    depth++;
                }
                log.error("[FlywayRepair] 完整异常栈:", e);
                try {
                    flyway.repair();
                } catch (Exception ignored) {
                }
            }
        };
    }
}
