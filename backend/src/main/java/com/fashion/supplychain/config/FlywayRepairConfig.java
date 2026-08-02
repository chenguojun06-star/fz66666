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

    /**
     * 注意：不注入任何 Spring Bean（避免循环依赖）。
     * FlywayMigrationStrategy 的入参 flyway 由 Flyway 自动装配提供，
     * DataSource 从 flyway.getConfiguration().getDataSource() 获取。
     *
     * <p>关键设计：不在启动时 sleep 阻塞 Spring 上下文刷新。
     * 之前的 Thread.sleep(0~15000ms) 会阻塞主线程，导致 Tomcat 端口虽然创建对象
     * 但未真正 bind，K8s 探针 connection refused，Pod 被反复重启。</p>
     *
     * <p>多实例并发安全性：
     * <ul>
     *   <li>migrate 本身用 flyway_schema_history 表锁串行化，不会死锁</li>
     *   <li>purgeFailedMigrations 是行级 DELETE，不会死锁</li>
     *   <li>repair 只在 migrate 失败时才执行（异常路径），正常启动无 repair</li>
     * </ul>
     * </p>
     */
    @Bean
    public org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            DataSource dataSource = flyway.getConfiguration().getDataSource();

            // 第1步：清理失败记录（行级DELETE，不阻塞，不会死锁）
            purgeFailedMigrations(dataSource);

            // 第2步：直接 migrate（正常情况无需 repair，migrate 靠表锁串行化）
            try {
                flyway.migrate();
                log.info("[FlywayRepair] Migrate complete.");
                return;
            } catch (Exception e) {
                log.warn("[FlywayRepair] 首次 Migrate 失败（{}），尝试 repair + 重试...", e.getMessage());
                logRootCauses(e);
            }

            // 第3步：异常路径 — repair（更新 checksum）+ 重试 migrate
            boolean repaired = retryRepair(flyway);
            if (repaired) {
                try {
                    flyway.migrate();
                    log.info("[FlywayRepair] Repair 后 Migrate 成功.");
                    return;
                } catch (Exception e) {
                    log.error("[FlywayRepair] Repair 后 Migrate 仍失败: {}", e.getMessage());
                    logRootCauses(e);
                }
            }

            // 第4步：最终兜底 — 清理失败记录，让下次启动能恢复，不抛异常（fail-safe）
            log.warn("[FlywayRepair] Migrate 最终失败，清理失败记录以确保下次启动能恢复...");
            purgeFailedMigrations(dataSource);
        };
    }

    /** 打印异常根因链（最多5层） */
    private void logRootCauses(Throwable e) {
        Throwable cause = e.getCause();
        int depth = 0;
        while (cause != null && depth < 5) {
            log.error("[FlywayRepair] 根因[{}]: {}", depth, cause.getMessage());
            cause = cause.getCause();
            depth++;
        }
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
