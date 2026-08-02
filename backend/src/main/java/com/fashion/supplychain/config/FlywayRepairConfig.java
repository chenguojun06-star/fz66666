package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ThreadLocalRandom;

/**
 * Flyway 迁移策略配置。
 *
 * <p>解决多实例并发启动时的 Flyway 死锁问题：
 * <ol>
 *   <li>多实例同时 repair/migrate 会争抢 flyway_schema_history 表锁导致死锁</li>
 *   <li>失败记录（success=0）不清理会阻塞后续 migrate</li>
 *   <li>checksum 不匹配（修复迁移脚本后）会触发 Validate failed</li>
 * </ol>
 * </p>
 *
 * <p>策略：
 * <ol>
 *   <li>随机延迟 0-15 秒启动，错开多实例并发窗口</li>
 *   <li>repair 重试 3 次，每次间隔递增</li>
 *   <li>repair 成功后再 migrate</li>
 *   <li>migrate 失败后再次 repair 清理失败记录</li>
 *   <li>所有失败不阻塞应用启动（fail-safe）</li>
 * </ol>
 * </p>
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true")
@Slf4j
public class FlywayRepairConfig {

    private static final int MAX_REPAIR_RETRIES = 3;
    private static final int MAX_STAGGER_DELAY_MS = 15_000;

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            // 多实例并发启动时，随机延迟错开执行窗口，避免争抢 flyway_schema_history 表锁
            int delay = ThreadLocalRandom.current().nextInt(MAX_STAGGER_DELAY_MS);
            log.info("[FlywayRepair] 随机延迟 {}ms 后启动（避免多实例并发死锁）", delay);
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            // 第1步：repair（清理失败记录 + 更新 checksum）
            boolean repaired = retryRepair(flyway);

            // 第2步：migrate
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
                // migrate 失败后再次 repair 清理失败记录，避免下次启动被阻塞
                if (!repaired) {
                    retryRepair(flyway);
                }
                // 不抛出异常，让应用继续启动（fail-safe）
            }
        };
    }

    /**
     * 重试 repair，最多 MAX_REPAIR_RETRIES 次。
     * 多实例并发时可能死锁，重试时增加延迟。
     *
     * @return true 如果 repair 成功
     */
    private boolean retryRepair(org.flywaydb.core.Flyway flyway) {
        for (int i = 1; i <= MAX_REPAIR_RETRIES; i++) {
            try {
                log.info("[FlywayRepair] 第 {}/{} 次 repair...", i, MAX_REPAIR_RETRIES);
                flyway.repair();
                log.info("[FlywayRepair] Repair 成功（第 {} 次）", i);
                return true;
            } catch (Exception e) {
                log.warn("[FlywayRepair] 第 {} 次 repair 失败: {}", i, e.getMessage());
                if (i < MAX_REPAIR_RETRIES) {
                    // 指数退避 + 随机抖动，避免所有实例同时重试
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
        log.error("[FlywayRepair] {} 次 repair 均失败，跳过 Flyway 修复", MAX_REPAIR_RETRIES);
        return false;
    }
}
