package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
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
 * <p>关键设计：直接从 Flyway 实例获取 DataSource，不依赖 Spring 注入 JdbcTemplate。
 * 这是为了打破 Bean 循环依赖：
 * flywayMigrationStrategy → JdbcTemplate → flywayInitializer → sqlSessionTemplate
 * → productionOrderMapper → dataConsistencyChecker → flywayInitializer（循环）</p>
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

    private static final int MAX_REPAIR_RETRIES = 3;
    private static final int MAX_STAGGER_DELAY_MS = 15_000;

    /**
     * 注意：不注入任何 Spring Bean（避免循环依赖）。
     * FlywayMigrationStrategy 的入参 flyway 由 Flyway 自动装配提供，
     * DataSource 从 flyway.getConfiguration().getDataSource() 获取。
     */
    @Bean
    public org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            // 第0步：随机延迟，错开多实例并发窗口
            int delay = ThreadLocalRandom.current().nextInt(MAX_STAGGER_DELAY_MS);
            log.info("[FlywayRepair] 随机延迟 {}ms 后启动（避免多实例并发死锁）", delay);
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // 第1步：用 Flyway 自带的 DataSource 直接删除失败记录（绕过 Flyway 表锁，避免死锁）
            DataSource dataSource = flyway.getConfiguration().getDataSource();
            purgeFailedMigrations(dataSource);

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
                purgeFailedMigrations(dataSource);
                // 不抛出异常，让应用继续启动（fail-safe）
            }
        };
    }

    /**
     * 用原生 JDBC 直接删除 flyway_schema_history 中 success=0 的失败记录。
     *
     * <p>为什么不注入 JdbcTemplate？
     * 因为 JdbcTemplate 会触发 Bean 循环依赖（见类注释）。直接用 Flyway 的 DataSource
     * 创建 Connection，完全不依赖 Spring 容器，从根源上消除循环。</p>
     *
     * <p>为什么不用 flyway.repair()？
     * repair() 会获取 flyway_schema_history 表锁，多实例并发时导致死锁。
     * DELETE 是行级锁，并发安全性更好。</p>
     */
    private void purgeFailedMigrations(DataSource dataSource) {
        try (Connection conn = dataSource.getConnection()) {
            // 先查询失败记录（用于日志诊断）
            List<String> failedVersions = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT installed_rank, version, description FROM flyway_schema_history WHERE success = 0");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    failedVersions.add(rs.getString("version") + "(" + rs.getString("description") + ")");
                }
            }
            if (failedVersions.isEmpty()) {
                log.info("[FlywayRepair] 无失败记录需要清理");
                return;
            }
            log.warn("[FlywayRepair] 发现 {} 条失败记录，开始清理: {}", failedVersions.size(), failedVersions);
            // 直接 DELETE，行级锁，不会死锁
            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM flyway_schema_history WHERE success = 0")) {
                int deleted = ps.executeUpdate();
                log.info("[FlywayRepair] 已清理 {} 条失败记录", deleted);
            }
        } catch (Exception e) {
            log.warn("[FlywayRepair] 清理失败记录异常（不影响启动）: {}", e.getMessage());
        }
    }

    /**
     * 重试 repair，最多 MAX_REPAIR_RETRIES 次。
     * 用于更新 checksum（修复迁移脚本后 checksum 不匹配）。
     * 失败记录的清理已由 purgeFailedMigrations 完成，repair 只负责 checksum。
     */
    private boolean retryRepair(Flyway flyway) {
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
