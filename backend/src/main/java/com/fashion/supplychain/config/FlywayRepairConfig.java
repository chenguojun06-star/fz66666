package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

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
