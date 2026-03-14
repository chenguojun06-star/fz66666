package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Flyway 启动前自动 repair：
 * 清除 flyway_schema_history 中 success=0 的失败记录（如 V3），
 * 然后正常执行 migrate。
 *
 * 仅在 spring.flyway.enabled=true 时生效（云端）。
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            log.info("[FlywayRepair] Running repair to remove failed migration entries...");
            flyway.repair();
            log.info("[FlywayRepair] Repair complete. Starting migrate...");
            flyway.migrate();
            log.info("[FlywayRepair] Migrate complete.");
        };
    }
}
