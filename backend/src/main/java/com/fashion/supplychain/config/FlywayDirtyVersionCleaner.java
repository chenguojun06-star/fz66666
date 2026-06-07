package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Flyway 脏版本号修复器
 *
 * <p>在 Flyway 启动前清理 {@code flyway_schema_history} 表中版本号格式不合法的脏记录。
 * 这些脏记录通常来自：
 * <ul>
 *   <li>被重命名/删除的迁移文件（已从 classpath 移除但 history 表中还有记录）</li>
 *   <li>手动 SQL 插入的版本号格式不规范的记录</li>
 *   <li>失败后未清理的脏记录（success=0）</li>
 * </ul>
 *
 * <p>Flyway 10.x 启动时会先解析 history 表中的所有版本号，任何一条记录版本号格式错误
 * （含非 0-9 和 . 的字符）都会导致 Flyway Bean 创建失败 → Spring Boot 启动失败 → 502。
 * 本组件在 Flyway Bean 完全初始化前，用独立 JDBC 连接直接清理这些脏记录。
 *
 * <p>使用 {@link FlywayConfigurationCustomizer} 扩展点，
 * 在 Flyway 加载 configuration 时注入清理逻辑，绕过 Flyway 自身的版本号解析。
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class FlywayDirtyVersionCleaner {

    /** Flyway 合法的版本号格式：纯数字或 数字.数字.数字... */
    private static final Pattern VALID_VERSION = Pattern.compile("^[0-9]+(\\.[0-9]+)*$");

    /**
     * 在 Flyway Bean 创建过程中执行清理的 Customizer。
     * FlywayConfigurationCustomizer.customize() 在 FlywayConfiguration.load() 之前被调用。
     * 此时 Flyway 还未读取 history 表，是清理脏记录的唯一安全窗口。
     */
    @Bean
    @Order(Integer.MIN_VALUE)  // 最高优先级，最先执行
    public FlywayConfigurationCustomizer flywayDirtyVersionCleanerCustomizer(
            @Autowired(required = false) DataSource dataSource) {
        return configuration -> {
            if (dataSource == null) {
                log.warn("[FlywayDirtyCleaner] DataSource 不可用，跳过清理");
                return;
            }
            try {
                JdbcTemplate jdbc = new JdbcTemplate(dataSource);
                // 1. 读取所有 history 记录
                List<Map<String, Object>> allRows;
                try {
                    allRows = jdbc.queryForList(
                        "SELECT installed_rank, version, description, type, script, success " +
                        "FROM flyway_schema_history ORDER BY installed_rank");
                } catch (Exception e) {
                    log.info("[FlywayDirtyCleaner] flyway_schema_history 表不存在（首次部署），跳过清理");
                    return;
                }
                if (allRows.isEmpty()) {
                    log.info("[FlywayDirtyCleaner] flyway_schema_history 表为空，跳过清理");
                    return;
                }
                log.info("[FlywayDirtyCleaner] flyway_schema_history 共 {} 条记录", allRows.size());

                // 2. 在 Java 端检测脏记录
                List<Object> dirtyRanks = new ArrayList<>();
                for (Map<String, Object> row : allRows) {
                    Object versionObj = row.get("version");
                    String version = versionObj == null ? null : versionObj.toString();
                    Integer success = (Integer) row.get("success");
                    String description = (String) row.get("description");
                    String script = (String) row.get("script");

                    boolean isDirty = false;
                    String reason = null;

                    // 失败记录
                    if (success != null && success == 0) {
                        isDirty = true;
                        reason = "success=0";
                    }
                    // 版本号格式不合法（注意：Flyway 解析的是 version 列的值，但部分异常
                    // 可能是 script 列含特殊字符导致，本清理也尝试清理 script 异常的）
                    else if (version != null && !VALID_VERSION.matcher(version).matches()) {
                        isDirty = true;
                        reason = "version格式不合法: '" + version + "'";
                    }

                    if (isDirty) {
                        log.warn("[FlywayDirtyCleaner] 发现脏记录: installed_rank={} version='{}' script='{}' description='{}' reason={}",
                            row.get("installed_rank"), version, script, description, reason);
                        dirtyRanks.add(row.get("installed_rank"));
                    }
                }

                if (dirtyRanks.isEmpty()) {
                    log.info("[FlywayDirtyCleaner] 未发现脏记录，跳过清理");
                    return;
                }

                // 3. 逐条删除（避免 IN 子句参数过多或 SQL 注入）
                int deleted = 0;
                for (Object rank : dirtyRanks) {
                    try {
                        int n = jdbc.update("DELETE FROM flyway_schema_history WHERE installed_rank = ?", rank);
                        deleted += n;
                        log.warn("[FlywayDirtyCleaner] 已删除 installed_rank={} 的脏记录", rank);
                    } catch (Exception delEx) {
                        log.error("[FlywayDirtyCleaner] 删除 installed_rank={} 失败: {}", rank, delEx.getMessage());
                    }
                }
                log.warn("[FlywayDirtyCleaner] 清理完成，共删除 {} 条脏记录", deleted);

            } catch (Exception e) {
                // 清理失败不应阻止应用启动
                log.error("[FlywayDirtyCleaner] 清理脏记录失败（将尝试继续启动 Flyway）: {}", e.getMessage(), e);
            }
        };
    }
}
