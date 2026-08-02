package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Flyway 迁移策略配置。
 *
 * <p>解决多实例并发启动时的 Flyway 死锁问题 + 失败记录自动清理：
 * <ol>
 *   <li>多实例同时 repair/migrate 会争抢 flyway_schema_history 表锁导致死锁</li>
 *   <li>失败记录（success=0）不清理会阻塞后续 migrate（Validate failed）</li>
 *   <li>checksum 不匹配（修复迁移脚本后）会触发 Validate failed</li>
 * </ol>
 * </p>
 *
 * <p>策略（三层防御）：
 * <ol>
 *   <li>随机延迟 0-15 秒启动，错开多实例并发窗口</li>
 *   <li>migrate 前用 JdbcTemplate 直接删除 success=0 的失败记录（绕过 Flyway 表锁）</li>
 *   <li>migrate 失败后再用 JdbcTemplate 清理失败记录（确保下次启动不被阻塞）</li>
 *   <li>repair 重试 3 次（备份方案，更新 checksum）</li>
 *   <li>所有失败不阻塞应用启动（fail-safe）</li>
 * </ol>
 * </p>
 *
 * <p>核心改进：用 JdbcTemplate 直接 DELETE 失败记录，而不是依赖 flyway.repair()。
 * 因为 repair() 会争抢 flyway_schema_history 表锁导致死锁，而 DELETE 是行级锁，
 * 并发安全性更好。这是本次 P0 事故的关键教训。</p>
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

    private static final int MAX_REPAIR_RETRIES = 3;
    private static final int MAX_STAGGER_DELAY_MS = 15_000;

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy(@Lazy JdbcTemplate jdbcTemplate) {
        // @Lazy 延迟注入 JdbcTemplate，打破启动时的 Bean 循环依赖：
        // flywayMigrationStrategy → flywayInitializer → sqlSessionTemplate → productionOrderMapper → dataConsistencyChecker → flywayInitializer
        return flyway -> {
            // 第0步：随机延迟，错开多实例并发窗口
            int delay = ThreadLocalRandom.current().nextInt(MAX_STAGGER_DELAY_MS);
            log.info("[FlywayRepair] 随机延迟 {}ms 后启动（避免多实例并发死锁）", delay);
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // 第1步：用 JdbcTemplate 直接删除失败记录（绕过 Flyway 表锁，避免死锁）
            purgeFailedMigrations(jdbcTemplate);

            // 第2步：repair（更新 checksum，清理残留）
            retryRepair(flyway);

            // 第3步：migrate
            try {
                flyway.migrate();
                log.info("[FlywayRepair] Migrate complete.");
            } catch (Exception e) {
                log.error("[FlywayRepair] Migrate 失败，详情: {}", e.getMessage());
                Throwable cause = e.getCause();
                int depth = 0;
                while (cause != null && depth < 5) {
                    log.error("[FlywayRepair] 根因[{}]: {}", depth, cause.getMessage());
                    cause = cause.getCause();
                    depth++;
                }
                log.error("[FlywayRepair] 完整异常栈:", e);
                // 第4步：migrate 失败后，再次清理失败记录，确保下次启动能恢复
                log.warn("[FlywayRepair] Migrate 失败，清理失败记录以确保下次启动能恢复...");
                purgeFailedMigrations(jdbcTemplate);
                // 不抛出异常，让应用继续启动（fail-safe）
            }
        };
    }

    /**
     * 用 JdbcTemplate 直接删除 flyway_schema_history 中 success=0 的失败记录。
     *
     * <p>为什么不用 flyway.repair()？
     * <ul>
     *   <li>repair() 会获取 flyway_schema_history 表锁，多实例并发时导致死锁</li>
     *   <li>DELETE 是行级锁，并发安全性更好</li>
     *   <li>repair() 还会做 checksum 更新等操作，但我们只需要清理失败记录</li>
     * </ul>
     * </p>
     *
     * <p>这个方法是 P0 事故（2026-08-02）的关键修复。之前依赖 repair() 清理失败记录，
     * 但多实例并发时 repair 死锁，失败记录没清理，导致后续所有 migrate 都失败，
     * 应用无法启动，20个版本部署全部失败。</p>
     */
    private void purgeFailedMigrations(JdbcTemplate jdbcTemplate) {
        try {
            // 先查询失败记录（用于日志诊断）
            List<Map<String, Object>> failed = jdbcTemplate.queryForList(
                    "SELECT installed_rank, version, description, success " +
                    "FROM flyway_schema_history WHERE success = 0");
            if (failed.isEmpty()) {
                log.info("[FlywayRepair] 无失败记录需要清理");
                return;
            }
            log.warn("[FlywayRepair] 发现 {} 条失败记录，开始清理: {}", failed.size(),
                    failed.stream()
                            .map(r -> r.get("version") + "(" + r.get("description") + ")")
                            .toList());
            // 直接 DELETE，行级锁，不会死锁
            int deleted = jdbcTemplate.update("DELETE FROM flyway_schema_history WHERE success = 0");
            log.info("[FlywayRepair] 已清理 {} 条失败记录", deleted);
        } catch (Exception e) {
            log.warn("[FlywayRepair] 清理失败记录异常（不影响启动）: {}", e.getMessage());
        }
    }

    /**
     * 重试 repair，最多 MAX_REPAIR_RETRIES 次。
     * 用于更新 checksum（修复迁移脚本后 checksum 不匹配）。
     * 失败记录的清理已由 purgeFailedMigrations 完成，repair 只负责 checksum。
     */
    private boolean retryRepair(org.flywaydb.core.Flyway flyway) {
        for (int i = 1; i <= MAX_REPAIR_RETRIES; i++) {
            try {
                log.info("[FlywayRepair] 第 {}/{} 次 repair（更新 checksum）...", i, MAX_REPAIR_RETRIES);
                flyway.repair();
                log.info("[FlywayRepair] Repair 成功（第 {} 次）", i);
                return true;
            } catch (Exception e) {
                log.warn("[FlywayRepair] 第 {} 次 repair 失败: {}", i, e.getMessage());
                if (i < MAX_REPAIR_RETRIES) {
                    int backoff = 2000 * i + ThreadLocalRandom.current().nextInt(1000);
                    log.info("[FlywayRepair] 等待 {}ms 后重试...", backoff);
                    try {
                        Thread.sleep(backoff);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return false;
                    }
                }
            }
        }
        log.error("[FlywayRepair] {} 次 repair 均失败（不影响清理失败记录，可继续 migrate）", MAX_REPAIR_RETRIES);
        return false;
    }
}
