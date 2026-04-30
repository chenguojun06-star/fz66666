package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Flyway 启动前自动 repair + migrate。
 * cloud_patch 已手动执行了大量迁移但未记录到 flyway_schema_history，
 * 因此 migrate 时可能遇到 Duplicate column / Unknown column / Table exists 等幂等冲突。
 * 此策略确保任何迁移错误都不会阻止应用启动。
 */
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
                // cloud_patch 已手动执行旧迁移 → 幂等冲突是预期行为
                // 任何 migrate 错误都不应阻止应用启动
                log.warn("[FlywayRepair] Migrate 失败（cloud_patch 已执行或兼容性问题），应用继续启动。详情: {}",
                        e.getMessage());
                try {
                    flyway.repair();
                } catch (Exception ignored) {
                    // 万一 repair 也失败，忽略
                }
            }
        };
    }
}
