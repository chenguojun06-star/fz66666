package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * 数据库迁移工具类
 * 提供表/列/索引存在性检查和安全执行 SQL 的工具方法
 */
@Component
@Slf4j
public class DatabaseMigrationHelper {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Environment environment;

    public JdbcTemplate getJdbcTemplate() {
        return jdbcTemplate;
    }

    public Environment getEnvironment() {
        return environment;
    }

    public boolean tableExists(String tableName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class,
                tableName);
        return count != null && count > 0;
    }

    public boolean columnExists(String tableName, String columnName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                Integer.class,
                tableName,
                columnName);
        return count != null && count > 0;
    }

    public void execSilently(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            return;
        }
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.warn("SQL failed: {}", e.getMessage());
        }
    }

    public boolean waitForDatabaseReady() {
        long waitMs = resolveInitializerWaitMs();
        long deadline = waitMs <= 0 ? 0 : (System.currentTimeMillis() + waitMs);
        while (true) {
            if (pingDatabaseOnce()) {
                return true;
            }
            if (waitMs <= 0 || System.currentTimeMillis() >= deadline) {
                return false;
            }
            try {
                long remaining = deadline - System.currentTimeMillis();
                Thread.sleep(Math.min(1000L, Math.max(1L, remaining)));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
    }

    private boolean pingDatabaseOnce() {
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private long resolveInitializerWaitMs() {
        if (environment == null) {
            return 0;
        }

        String url = environment.getProperty("spring.datasource.url");
        if (url != null && url.toLowerCase().contains("jdbc:h2:")) {
            return 0;
        }

        String[] profiles = environment.getActiveProfiles();
        if (profiles != null && Arrays.stream(profiles).anyMatch(p -> p != null && "test".equalsIgnoreCase(p))) {
            return 0;
        }

        String raw = environment.getProperty("fashion.db.initializer-wait-ms");
        if (raw == null || raw.trim().isEmpty()) {
            return 30000L;
        }
        try {
            long v = Long.parseLong(raw.trim());
            if (v < 0) {
                return 0;
            }
            return Math.min(v, 120000L);
        } catch (Exception e) {
            return 30000L;
        }
    }

    public void ensurePermissionNameByCode(String code, String name) {
        try {
            jdbcTemplate.update(
                    "UPDATE t_permission SET permission_name = ? WHERE permission_code = ? AND (permission_name IS NULL OR permission_name <> ?)",
                    name,
                    code,
                    name);
        } catch (Exception e) {
            log.warn("Failed to ensure permission name by code: code={}, name={}, err={}", code, name, e.getMessage());
        }
    }

    public boolean indexExists(String tableName, String indexName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?",
                Integer.class,
                tableName,
                indexName);
        return count != null && count > 0;
    }

    public void addIndexIfAbsent(String tableName, String indexName, String columnsSql) {
        if (indexExists(tableName, indexName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " ADD INDEX " + indexName + " (" + columnsSql + ")");
    }

    public void addUniqueKeyIfAbsent(String tableName, String keyName, String columnsSql) {
        if (indexExists(tableName, keyName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " ADD UNIQUE KEY " + keyName + " (" + columnsSql + ")");
    }

    public void dropIndexIfExists(String tableName, String indexName) {
        if (!indexExists(tableName, indexName)) {
            return;
        }
        execSilently("ALTER TABLE " + tableName + " DROP INDEX " + indexName);
    }

    public String loadCreateTableStatementFromInitSql(String tableName) {
        try {
            ClassPathResource resource = new ClassPathResource("init.sql");
            if (!resource.exists()) {
                return null;
            }
            String content = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String marker = "CREATE TABLE IF NOT EXISTS " + tableName;
            int start = content.indexOf(marker);
            if (start < 0) {
                return null;
            }
            int end = content.indexOf(";", start);
            if (end < 0) {
                return null;
            }
            return content.substring(start, end + 1);
        } catch (Exception e) {
            return null;
        }
    }

    public boolean shouldSkipViewInitialization() {
        if (environment == null) {
            return false;
        }

        String url = environment.getProperty("spring.datasource.url");
        if (url != null && url.toLowerCase().contains("jdbc:h2:")) {
            return true;
        }

        String[] profiles = environment.getActiveProfiles();
        return profiles != null && Arrays.stream(profiles).anyMatch(p -> p != null && "test".equalsIgnoreCase(p));
    }

    public boolean viewExists(String viewName) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = ?",
                Integer.class,
                viewName);
        return count != null && count > 0;
    }
}
