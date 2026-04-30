package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
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
            try {
                flyway.repair();
                log.info("[FlywayRepair] Repair complete. Starting migrate...");
            } catch (Exception e) {
                log.warn("[FlywayRepair] Repair failed (可能因历史版本号含非法字符)，跳过repair直接migrate: {}", e.getMessage());
            }
            try {
                // 忽略已知可恢复的错误（列/表已存在等幂等冲突），让 Flyway 尽可能跑完
                flyway.migrate();
                log.info("[FlywayRepair] Migrate complete.");
            } catch (org.flywaydb.core.internal.exception.FlywayMigrateException e) {
                String msg = e.getMessage();
                if (msg != null && (msg.contains("Duplicate column") || msg.contains("Duplicate key") || msg.contains("already exists") || msg.contains("Table") && msg.contains("already exists"))) {
                    log.warn("[FlywayRepair] 幂等冲突（列/表已存在），retry after repair: {}", msg);
                    try {
                        flyway.repair();
                        flyway.migrate();
                        log.info("[FlywayRepair] Retry migrate after repair complete.");
                    } catch (Exception e2) {
                        log.error("[FlywayRepair] Retry still failed, giving up: {}", e2.getMessage(), e2);
                        // 给出最终警告但不终止启动——旧的 cloud_patch 已经手动执行过了
                        log.warn("[FlywayRepair] 迁移中止，但应用将继续启动。注意：新迁移可能未执行。");
                    }
                } else {
                    log.error("[FlywayRepair] Migrate failed: {}", msg, e);
                    throw e;
                }
            } catch (Exception e) {
                log.error("[FlywayRepair] Migrate failed: {}", e.getMessage(), e);
                throw e;
            }
        };
    }
}
