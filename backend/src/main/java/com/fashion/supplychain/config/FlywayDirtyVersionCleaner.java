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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Flyway 脏版本号修复器 + 版本号标准化器
 *
 * <p>在 Flyway 启动前：
 * <ol>
 *   <li>清理 {@code flyway_schema_history} 表中版本号格式不合法的脏记录</li>
 *   <li>将字母后缀版本号（如 V20260222b）标准化为点分隔版本号（如 V20260222.02），
 *       以兼容 Flyway 10.x 的版本号解析器（只支持纯数字和点分隔数字）</li>
 * </ol>
 *
 * <p>Flyway 10.x 的 {@code MigrationVersion} 使用 {@code SPLIT_REGEX = \\.(?=\\d)}
 * 分割版本号，每个部分调用 {@code new BigInteger(part)}，字母后缀会导致
 * {@code NumberFormatException} → {@code FlywayException} → Bean 创建失败 → 502。
 *
 * <p>使用 {@link FlywayConfigurationCustomizer} 扩展点，
 * 在 Flyway 加载 configuration 时注入标准化逻辑，绕过 Flyway 自身的版本号解析。
 */
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true", matchIfMissing = true)
@Slf4j
public class FlywayDirtyVersionCleaner {

    /** Flyway 合法的版本号格式：纯数字或 数字.数字.数字... */
    private static final Pattern VALID_VERSION = Pattern.compile("^[0-9]+(\\.[0-9]+)*$");

    /**
     * 字母后缀版本号映射：V20260222b → V20260222.02
     * 在迁移文件重命名后，需要同步更新 history 表中的 version 和 script 列
     */
    private static final Map<String, String> VERSION_ALIAS_MAP = new LinkedHashMap<>();
    static {
        // a=01, b=02, c=03, d=04, e=05
        VERSION_ALIAS_MAP.put("20260222b", "20260222.02");
        VERSION_ALIAS_MAP.put("20260222c", "20260222.03");
        VERSION_ALIAS_MAP.put("20260222d", "20260222.04");
        VERSION_ALIAS_MAP.put("20260222e", "20260222.05");
        VERSION_ALIAS_MAP.put("20260223b", "20260223.02");
        VERSION_ALIAS_MAP.put("20260223c", "20260223.03");
        VERSION_ALIAS_MAP.put("20260223d", "20260223.04");
        VERSION_ALIAS_MAP.put("20260225b", "20260225.02");
        VERSION_ALIAS_MAP.put("20260225c", "20260225.03");
        VERSION_ALIAS_MAP.put("20260226b", "20260226.02");
        VERSION_ALIAS_MAP.put("20260226c", "20260226.03");
        VERSION_ALIAS_MAP.put("20260227a", "20260227.01");
        VERSION_ALIAS_MAP.put("20260301b", "20260301.02");
        VERSION_ALIAS_MAP.put("20260302b", "20260302.02");
        VERSION_ALIAS_MAP.put("20260302c", "20260302.03");
        VERSION_ALIAS_MAP.put("20260304b", "20260304.02");
        VERSION_ALIAS_MAP.put("20260306a", "20260306.01");
        VERSION_ALIAS_MAP.put("20260308b", "20260308.02");
        VERSION_ALIAS_MAP.put("20260316b", "20260316.02");
        VERSION_ALIAS_MAP.put("20260316c", "20260316.03");
        VERSION_ALIAS_MAP.put("20260317b", "20260317.02");
        VERSION_ALIAS_MAP.put("20260322b", "20260322.02");
        VERSION_ALIAS_MAP.put("20260421001b", "20260421001.02");
        VERSION_ALIAS_MAP.put("33b", "33.02");
        VERSION_ALIAS_MAP.put("34b", "34.02");
    }

    /**
     * 在 Flyway Bean 创建过程中执行清理和标准化的 Customizer。
     * FlywayConfigurationCustomizer.customize() 在 FlywayConfiguration.load() 之前被调用。
     * 此时 Flyway 还未读取 history 表，是修改 history 表的唯一安全窗口。
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

                // 2. 在 Java 端检测脏记录 + 版本号标准化
                List<Object> dirtyRanks = new ArrayList<>();
                int renamedCount = 0;
                for (Map<String, Object> row : allRows) {
                    Object versionObj = row.get("version");
                    String version = versionObj == null ? null : versionObj.toString();
                    // success 列在 MySQL TINYINT(1) 下，不同 JDBC 驱动返回类型不同：
                    // MySQL Connector/J 8.x 返回 Boolean，旧版返回 Integer
                    Integer success = null;
                    Object successObj = row.get("success");
                    if (successObj instanceof Boolean) {
                        success = ((Boolean) successObj) ? 1 : 0;
                    } else if (successObj instanceof Integer) {
                        success = (Integer) successObj;
                    } else if (successObj instanceof Number) {
                        success = ((Number) successObj).intValue();
                    }
                    String description = (String) row.get("description");
                    String script = (String) row.get("script");

                    boolean isDirty = false;
                    String reason = null;

                    // 失败记录
                    if (success != null && success == 0) {
                        isDirty = true;
                        reason = "success=0";
                    }
                    // 版本号格式不合法
                    else if (version != null && !VALID_VERSION.matcher(version).matches()) {
                        // 检查是否在字母后缀映射表中（需要标准化而非删除）
                        String newVersion = VERSION_ALIAS_MAP.get(version);
                        if (newVersion != null) {
                            // 标准化：更新 version 和 script 列
                            String newScript = script != null ? script.replace("V" + version, "V" + newVersion) : null;
                            try {
                                jdbc.update(
                                    "UPDATE flyway_schema_history SET version = ?, script = ? WHERE installed_rank = ?",
                                    newVersion, newScript, row.get("installed_rank"));
                                log.info("[FlywayDirtyCleaner] 版本号标准化: installed_rank={} '{}' → '{}' script='{}'",
                                    row.get("installed_rank"), version, newVersion, newScript);
                                renamedCount++;
                            } catch (Exception updateEx) {
                                log.error("[FlywayDirtyCleaner] 标准化 installed_rank={} 失败: {}",
                                    row.get("installed_rank"), updateEx.getMessage());
                            }
                        } else {
                            // 不在映射表中 → 格式真不合法 → 删除
                            isDirty = true;
                            reason = "version格式不合法: '" + version + "'";
                        }
                    }

                    if (isDirty) {
                        log.warn("[FlywayDirtyCleaner] 发现脏记录: installed_rank={} version='{}' script='{}' description='{}' reason={}",
                            row.get("installed_rank"), version, script, description, reason);
                        dirtyRanks.add(row.get("installed_rank"));
                    }
                }

                if (renamedCount > 0) {
                    log.warn("[FlywayDirtyCleaner] 版本号标准化完成，共更新 {} 条记录", renamedCount);
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