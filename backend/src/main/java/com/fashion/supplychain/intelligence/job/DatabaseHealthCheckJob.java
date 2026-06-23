package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@Lazy
public class DatabaseHealthCheckJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 15 3 * * ?")
    public void dailyHealthCheck() {
        log.info("[DB健康巡检] 开始每日数据库健康检查...");

        List<String> criticals = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<String> infos = new ArrayList<>();

        checkConnection(criticals, infos);
        checkConnectionPool(criticals, warnings, infos);
        checkSlowQueries(warnings, infos);
        checkDeadlocks(warnings, infos);
        checkFlywayStatus(criticals, infos);
        checkTenantIsolation(criticals);
        checkStorage(warnings, infos);

        if (!criticals.isEmpty()) {
            log.error("[DB健康巡检] ❌ 发现严重问题 ({} 项): {}", criticals.size(), String.join("; ", criticals));
        }
        if (!warnings.isEmpty()) {
            log.warn("[DB健康巡检] ⚠️ 发现警告 ({} 项): {}", warnings.size(), String.join("; ", warnings));
        }
        if (!infos.isEmpty() && criticals.isEmpty() && warnings.isEmpty()) {
            log.info("[DB健康巡检] ✅ 数据库健康状态正常。{}", String.join("; ", infos));
        }

        log.info("[DB健康巡检] 检查完成。严重: {}, 警告: {}, 信息: {}",
                criticals.size(), warnings.size(), infos.size());
    }

    private void checkConnection(List<String> criticals, List<String> infos) {
        try {
            long start = System.currentTimeMillis();
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            long latency = System.currentTimeMillis() - start;
            infos.add("响应延迟 " + latency + "ms");
        } catch (Exception e) {
            criticals.add("数据库连接异常: " + e.getMessage());
        }
    }

    private void checkConnectionPool(List<String> criticals, List<String> warnings, List<String> infos) {
        try {
            Integer threadsConnected = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Threads_connected'",
                    (rs, rowNum) -> rs.getInt("Value"));
            Integer maxConnections = jdbcTemplate.queryForObject(
                    "SHOW VARIABLES LIKE 'max_connections'",
                    (rs, rowNum) -> rs.getInt("Value"));

            if (threadsConnected != null && maxConnections != null) {
                double usage = (double) threadsConnected / maxConnections * 100;
                infos.add("连接使用率 " + Math.round(usage) + "% (" + threadsConnected + "/" + maxConnections + ")");

                if (usage > 90) {
                    criticals.add("连接使用率超过90% (" + Math.round(usage) + "%)，即将达到上限");
                } else if (usage > 70) {
                    warnings.add("连接使用率偏高 (" + Math.round(usage) + "%)");
                }
            }

            List<Map<String, Object>> processList = jdbcTemplate.queryForList("SHOW PROCESSLIST");
            long longHeld = processList.stream()
                    .filter(p -> p.get("Time") instanceof Number && ((Number) p.get("Time")).longValue() > 300)
                    .count();
            if (longHeld > 5) {
                warnings.add("长连接数偏多 (" + longHeld + "个>5分钟)");
            }
        } catch (Exception ignored) {}
    }

    private void checkSlowQueries(List<String> warnings, List<String> infos) {
        try {
            Integer slowQueries = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Slow_queries'",
                    (rs, rowNum) -> rs.getInt("Value"));
            if (slowQueries != null) {
                infos.add("累计慢查询 " + slowQueries + " 次");
                if (slowQueries > 500) {
                    warnings.add("慢查询累计超过500次 (" + slowQueries + ")，建议优化索引和SQL");
                }
            }

            Long questions = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Questions'",
                    (rs, rowNum) -> rs.getLong("Value"));
            if (questions != null && questions > 0 && slowQueries != null) {
                double slowRate = (double) slowQueries / questions * 100;
                infos.add("慢查询比例 " + String.format("%.3f", slowRate) + "%");
                if (slowRate > 1.0) {
                    warnings.add("慢查询比例超过1% (" + String.format("%.3f", slowRate) + "%)，需重点关注");
                }
            }
        } catch (Exception ignored) {}
    }

    private void checkDeadlocks(List<String> warnings, List<String> infos) {
        try {
            Integer deadlocks = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Innodb_deadlocks'",
                    (rs, rowNum) -> rs.getInt("Value"));
            if (deadlocks != null) {
                infos.add("累计死锁 " + deadlocks + " 次");
                if (deadlocks > 20) {
                    warnings.add("死锁次数偏多 (" + deadlocks + ")，建议检查事务逻辑");
                }
            }
        } catch (Exception ignored) {}
    }

    private void checkFlywayStatus(List<String> criticals, List<String> infos) {
        try {
            Integer tableExists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES " +
                            "WHERE table_schema = DATABASE() AND table_name = 'flyway_schema_history'",
                    Integer.class);
            if (tableExists != null && tableExists > 0) {
                Integer failedCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0",
                        Integer.class);
                Integer totalCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM flyway_schema_history",
                        Integer.class);

                infos.add("迁移记录 " + totalCount + " 次");

                if (failedCount != null && failedCount > 0) {
                    criticals.add("有 " + failedCount + " 次数据库迁移失败，需要立即处理");
                }
            }
        } catch (Exception ignored) {}
    }

    private void checkTenantIsolation(List<String> criticals) {
        String[][] businessChecks = {
                {"t_production_order", "生产订单"},
                {"t_scan_record", "扫码记录"},
                {"t_material_stock", "物料库存"},
                {"t_style_info", "款式信息"},
                {"t_wage_settlement", "工资结算"}
        };

        for (String[] check : businessChecks) {
            try {
                Integer nullCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM " + check[0] + " WHERE tenant_id IS NULL",
                        Integer.class);
                if (nullCount != null && nullCount > 0) {
                    criticals.add(check[1] + "中有 " + nullCount + " 条数据缺少tenant_id，存在数据安全风险");
                }
            } catch (Exception ignored) {}
        }
    }

    private void checkStorage(List<String> warnings, List<String> infos) {
        try {
            Long dbSizeBytes = jdbcTemplate.queryForObject(
                    "SELECT SUM(data_length + index_length) FROM information_schema.TABLES " +
                            "WHERE table_schema = DATABASE()",
                    Long.class);
            if (dbSizeBytes != null) {
                double sizeMB = dbSizeBytes / 1024.0 / 1024.0;
                infos.add("数据库总大小 " + Math.round(sizeMB) + "MB");

                if (sizeMB > 10240) {
                    warnings.add("数据库超过10GB (" + Math.round(sizeMB) + "MB)，建议归档历史数据");
                }
            }

            List<Map<String, Object>> bigTables = jdbcTemplate.queryForList(
                    "SELECT TABLE_NAME as name, TABLE_ROWS as rows " +
                            "FROM information_schema.TABLES WHERE table_schema = DATABASE() " +
                            "AND TABLE_ROWS > 1000000 ORDER BY TABLE_ROWS DESC LIMIT 5");
            if (!bigTables.isEmpty()) {
                StringBuilder sb = new StringBuilder("大表(" + bigTables.size() + "张>100万行): ");
                for (int i = 0; i < bigTables.size(); i++) {
                    Map<String, Object> bt = bigTables.get(i);
                    sb.append(bt.get("name")).append("(").append(bt.get("rows")).append("行)");
                    if (i < bigTables.size() - 1) sb.append(", ");
                }
                warnings.add(sb.toString());
            }
        } catch (Exception ignored) {}
    }
}
