package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.*;

/**
 * 系统健康检查工具 — 防炸库核心防线。
 * <p>
 * 所有输出使用业务语言，不暴露数据库内部细节。
 * 当用户问"系统状态""系统健康""系统运行情况""数据安全"时调用。
 * </p>
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(name = "tool_db_health_check", description = "系统健康检查工具", domain = ToolDomain.SYSTEM, timeoutMs = 20000)
@McpToolAnnotation(
        name = "tool_db_health_check",
        description = "系统健康检查：运行状态、响应速度、数据安全、存储空间、更新记录",
        domain = ToolDomain.SYSTEM,
        readOnly = true,
        timeoutSeconds = 20,
        version = "1.0",
        tags = {"系统健康", "运行状态", "数据安全", "存储空间", "防炸库"}
)
public class DatabaseHealthCheckTool extends AbstractAgentTool {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 业务名映射：表名 → 用户能理解的名称 */
    private static final Map<String, String> TABLE_BUSINESS_NAMES = Map.of(
            "t_production_order", "生产订单",
            "t_scan_record", "扫码记录",
            "t_material_stock", "物料库存",
            "t_factory", "工厂信息",
            "t_product_style", "款式信息",
            "t_cutting_task", "裁剪任务",
            "t_wage_settlement", "工资结算",
            "t_material_inbound", "物料入库",
            "t_product_outstock", "成品出库",
            "t_quality_inspection", "质检记录"
    );

    @Override
    public String getName() {
        return "tool_db_health_check";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of(
                "overview", "slow_queries", "deadlocks", "connections",
                "table_sizes", "flyway_status", "index_health", "full_check"));
        action.put("description", "检查类型：overview=总览，slow_queries=耗时查询，deadlocks=访问冲突，connections=系统连接，table_sizes=存储空间，flyway_status=更新记录，index_health=检索效率，full_check=全面检查");
        properties.put("action", action);
        properties.put("topN", intProp("返回前N条记录（默认10）"));
        return buildToolDef(
                "系统健康检查工具。当用户问'系统状态''系统运行情况''数据安全''存储空间'时调用。" +
                        "提供实时系统健康指标，帮助快速定位问题。所有输出使用业务语言。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "overview";
        int topN = optionalInt(args, "topN") != null ? optionalInt(args, "topN") : 10;

        return switch (action) {
            case "overview" -> executeOverview();
            case "slow_queries" -> executeSlowQueries(topN);
            case "deadlocks" -> executeDeadlocks();
            case "connections" -> executeConnections();
            case "table_sizes" -> executeTableSizes(topN);
            case "flyway_status" -> executeFlywayStatus();
            case "index_health" -> executeIndexHealth(topN);
            case "full_check" -> executeFullCheck();
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeOverview() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "总览");

        // 基本连接测试
        long start = System.currentTimeMillis();
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            long latency = System.currentTimeMillis() - start;
            result.put("系统连接", "正常");
            result.put("响应速度", latency + "毫秒");
        } catch (Exception e) {
            result.put("系统连接", "异常");
            return errorJson("系统连接异常，请联系管理员");
        }

        // 连接数
        try {
            Integer threadsConnected = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Threads_connected'", (rs, rowNum) -> rs.getInt("Value"));
            Integer maxConnections = jdbcTemplate.queryForObject(
                    "SHOW VARIABLES LIKE 'max_connections'", (rs, rowNum) -> rs.getInt("Value"));
            if (threadsConnected != null && maxConnections != null) {
                double usagePercent = (double) threadsConnected / maxConnections * 100;
                result.put("系统负载", Math.round(usagePercent) + "%");
                if (usagePercent > 80) {
                    result.put("负载提示", "系统负载较高，可能影响响应速度");
                }
            }
        } catch (Exception ignored) {}

        // 耗时查询计数
        try {
            Integer slowQueries = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Slow_queries'", (rs, rowNum) -> rs.getInt("Value"));
            if (slowQueries != null && slowQueries > 50) {
                result.put("耗时查询提示", "存在较多耗时查询（" + slowQueries + "次），可能影响系统速度");
            }
        } catch (Exception ignored) {}

        // 数据访问冲突
        try {
            Integer deadlocks = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Innodb_deadlocks'", (rs, rowNum) -> rs.getInt("Value"));
            if (deadlocks != null && deadlocks > 0) {
                result.put("冲突提示", "检测到" + deadlocks + "次数据访问冲突，系统已自动恢复");
            }
        } catch (Exception ignored) {}

        // 存储空间
        try {
            Long dbSizeBytes = jdbcTemplate.queryForObject(
                    "SELECT SUM(data_length + index_length) FROM information_schema.TABLES WHERE table_schema = DATABASE()",
                    Long.class);
            if (dbSizeBytes != null) {
                result.put("存储空间", Math.round(dbSizeBytes / 1024.0 / 1024.0) + "MB");
            }
        } catch (Exception ignored) {}

        // 数据更新记录异常
        try {
            Integer tableExists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_name = 'flyway_schema_history'",
                    Integer.class);
            if (tableExists != null && tableExists > 0) {
                Integer failedCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0",
                        Integer.class);
                if (failedCount != null && failedCount > 0) {
                    result.put("更新记录提示", "有" + failedCount + "次系统更新记录异常，可能影响系统稳定性");
                }
            }
        } catch (Exception ignored) {}

        return successJson("系统健康总览", result);
    }

    private String executeSlowQueries(int topN) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "耗时查询分析");

        try {
            Long longQueryTime = jdbcTemplate.queryForObject(
                    "SHOW VARIABLES LIKE 'long_query_time'", (rs, rowNum) -> rs.getLong("Value"));
            result.put("耗时阈值", longQueryTime + "秒");

            List<Map<String, Object>> topSlow = jdbcTemplate.queryForList(
                    "SELECT DIGEST_TEXT as 查询摘要, COUNT_STAR as 执行次数, "
                            + "ROUND(SUM_TIMER_WAIT / 1000000000000, 3) as 总耗时秒, "
                            + "ROUND(AVG_TIMER_WAIT / 1000000000, 3) as 平均耗时毫秒, "
                            + "ROUND(MAX_TIMER_WAIT / 1000000000, 3) as 最大耗时毫秒 "
                            + "FROM performance_schema.events_statements_summary_by_digest "
                            + "WHERE DIGEST_TEXT IS NOT NULL "
                            + "ORDER BY SUM_TIMER_WAIT DESC LIMIT ?", topN);
            result.put("耗时排行", topSlow);
        } catch (Exception e) {
            result.put("提示", "无法获取耗时查询信息");
        }

        return successJson("耗时查询分析", result);
    }

    private String executeDeadlocks() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "数据访问冲突");

        try {
            Integer deadlocks = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Innodb_deadlocks'", (rs, rowNum) -> rs.getInt("Value"));
            result.put("冲突总次数", deadlocks);
            result.put("说明", "数据访问冲突是系统自动处理的正常现象，偶尔发生不影响业务");

            if (deadlocks != null && deadlocks > 5) {
                result.put("提示", "冲突次数偏多，建议联系管理员检查");
            }
        } catch (Exception e) {
            result.put("提示", "无法获取冲突信息");
        }

        return successJson("数据访问冲突检查", result);
    }

    private String executeConnections() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "系统连接状态");

        try {
            List<Map<String, Object>> processList = jdbcTemplate.queryForList("SHOW PROCESSLIST");
            result.put("当前连接数", processList.size());

            long active = processList.stream()
                    .filter(p -> "Query".equals(p.get("Command"))).count();
            long idle = processList.stream()
                    .filter(p -> "Sleep".equals(p.get("Command"))).count();
            long longHeld = processList.stream()
                    .filter(p -> p.get("Time") instanceof Number && ((Number) p.get("Time")).longValue() > 60)
                    .count();

            result.put("活跃连接", active);
            result.put("空闲连接", idle);
            result.put("长连接", longHeld);

            if (longHeld > 5) {
                result.put("提示", "长连接数偏多（" + longHeld + "），可能影响系统性能");
            }
        } catch (Exception e) {
            result.put("提示", "无法获取连接信息");
        }

        return successJson("系统连接状态", result);
    }

    private String executeTableSizes(int topN) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "存储空间分析");

        try {
            List<Map<String, Object>> tableSizes = jdbcTemplate.queryForList(
                    "SELECT TABLE_NAME as 数据类别, TABLE_ROWS as 记录数, "
                            + "ROUND(DATA_LENGTH / 1024 / 1024, 2) as 数据空间MB, "
                            + "ROUND(INDEX_LENGTH / 1024 / 1024, 2) as 索引空间MB, "
                            + "ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as 总空间MB "
                            + "FROM information_schema.TABLES WHERE table_schema = DATABASE() "
                            + "ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC LIMIT ?", topN);

            // 翻译表名为业务名称
            for (Map<String, Object> row : tableSizes) {
                Object tableName = row.get("数据类别");
                if (tableName instanceof String name) {
                    String businessName = TABLE_BUSINESS_NAMES.getOrDefault(name, translateTableName(name));
                    row.put("数据类别", businessName);
                }
            }

            result.put("空间排行", tableSizes);
        } catch (Exception e) {
            result.put("提示", "无法获取存储空间信息");
        }

        return successJson("存储空间分析", result);
    }

    private String executeFlywayStatus() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "系统更新记录");

        try {
            List<Map<String, Object>> recentMigrations = jdbcTemplate.queryForList(
                    "SELECT installed_rank as 序号, version as 版本号, description as 更新说明, "
                            + "installed_on as 更新时间, execution_time as 耗时毫秒, "
                            + "CASE WHEN success = 1 THEN '成功' ELSE '失败' END as 状态 "
                            + "FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 10");
            result.put("最近更新", recentMigrations);

            List<Map<String, Object>> failedMigrations = jdbcTemplate.queryForList(
                    "SELECT version as 版本号, description as 更新说明, installed_on as 更新时间 "
                            + "FROM flyway_schema_history WHERE success = 0 ORDER BY installed_rank DESC");
            if (!failedMigrations.isEmpty()) {
                result.put("失败更新", failedMigrations);
                result.put("提示", "有" + failedMigrations.size() + "次系统更新失败，可能影响系统稳定性");
            }

            Integer totalCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM flyway_schema_history", Integer.class);
            result.put("累计更新次数", totalCount);
        } catch (Exception e) {
            result.put("提示", "无法获取更新记录");
        }

        return successJson("系统更新记录", result);
    }

    private String executeIndexHealth(int topN) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "检索效率检查");

        try {
            List<Map<String, Object>> duplicateIndexes = jdbcTemplate.queryForList(
                    "SELECT TABLE_NAME as 数据类别, GROUP_CONCAT(INDEX_NAME) as 重复检索项, "
                            + "COLUMN_NAME as 字段 "
                            + "FROM information_schema.STATISTICS WHERE table_schema = DATABASE() "
                            + "GROUP BY TABLE_NAME, COLUMN_NAME HAVING COUNT(*) > 1 "
                            + "LIMIT ?", topN);

            for (Map<String, Object> row : duplicateIndexes) {
                Object tableName = row.get("数据类别");
                if (tableName instanceof String name) {
                    row.put("数据类别", TABLE_BUSINESS_NAMES.getOrDefault(name, translateTableName(name)));
                }
            }

            if (!duplicateIndexes.isEmpty()) {
                result.put("重复检索项", duplicateIndexes);
                result.put("提示", "存在重复的检索配置，不影响业务但占用额外存储空间");
            } else {
                result.put("检索配置", "正常，无重复项");
            }
        } catch (Exception e) {
            result.put("提示", "无法获取检索效率信息");
        }

        return successJson("检索效率检查", result);
    }

    private String executeFullCheck() throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("检查类型", "全面检查");
        result.put("检查时间", new Date());

        List<String> criticals = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        // 1. 连接检查
        try {
            long start = System.currentTimeMillis();
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            result.put("响应速度", (System.currentTimeMillis() - start) + "毫秒");
        } catch (Exception e) {
            criticals.add("系统连接异常，无法访问数据");
        }

        // 2. 系统负载
        try {
            Integer threadsConnected = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Threads_connected'", (rs, rowNum) -> rs.getInt("Value"));
            Integer maxConnections = jdbcTemplate.queryForObject(
                    "SHOW VARIABLES LIKE 'max_connections'", (rs, rowNum) -> rs.getInt("Value"));
            if (threadsConnected != null && maxConnections != null) {
                double usage = (double) threadsConnected / maxConnections * 100;
                result.put("系统负载", Math.round(usage) + "%");
                if (usage > 90) criticals.add("系统负载" + Math.round(usage) + "%，即将达到上限，可能影响使用");
                else if (usage > 70) warnings.add("系统负载" + Math.round(usage) + "%，偏高");
            }
        } catch (Exception ignored) {}

        // 3. 耗时查询
        try {
            Integer slowQueries = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Slow_queries'", (rs, rowNum) -> rs.getInt("Value"));
            if (slowQueries != null && slowQueries > 100) {
                warnings.add("耗时查询较多（" + slowQueries + "次），系统响应可能变慢");
            }
        } catch (Exception ignored) {}

        // 4. 数据访问冲突
        try {
            Integer deadlocks = jdbcTemplate.queryForObject(
                    "SHOW STATUS LIKE 'Innodb_deadlocks'", (rs, rowNum) -> rs.getInt("Value"));
            if (deadlocks != null && deadlocks > 5) {
                warnings.add("数据访问冲突" + deadlocks + "次，冲突较多建议检查");
            }
        } catch (Exception ignored) {}

        // 5. 系统更新失败
        try {
            Integer failedCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0", Integer.class);
            if (failedCount != null && failedCount > 0) {
                criticals.add("有" + failedCount + "次系统更新失败，可能影响系统稳定性");
            }
        } catch (Exception ignored) {}

        // 6. 数据归属检查（多租户隔离）
        String[][] businessChecks = {
                {"t_production_order", "生产订单"},
                {"t_scan_record", "扫码记录"},
                {"t_material_stock", "物料库存"}
        };
        for (String[] check : businessChecks) {
            try {
                Integer nullCount = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM " + check[0] + " WHERE tenant_id IS NULL", Integer.class);
                if (nullCount != null && nullCount > 0) {
                    criticals.add(check[1] + "中有" + nullCount + "条数据缺少归属信息，存在数据安全风险");
                }
            } catch (Exception ignored) {}
        }

        // 7. 大数据量检查
        try {
            List<Map<String, Object>> bigTables = jdbcTemplate.queryForList(
                    "SELECT TABLE_NAME as name, TABLE_ROWS as rows "
                            + "FROM information_schema.TABLES WHERE table_schema = DATABASE() "
                            + "AND TABLE_ROWS > 1000000 ORDER BY TABLE_ROWS DESC");
            for (Map<String, Object> bt : bigTables) {
                String bizName = TABLE_BUSINESS_NAMES.getOrDefault(
                        bt.get("name").toString(), translateTableName(bt.get("name").toString()));
                warnings.add(bizName + "数据量较大（" + bt.get("rows") + "条），建议定期归档历史数据");
            }
        } catch (Exception ignored) {}

        result.put("严重问题", criticals.isEmpty() ? "无" : criticals);
        result.put("一般提醒", warnings.isEmpty() ? "无" : warnings);
        result.put("健康状态", criticals.isEmpty() ? (warnings.isEmpty() ? "健康" : "需关注") : "需紧急处理");

        return successJson("系统全面检查", result);
    }

    /** 将表名翻译为用户可理解的业务名称 */
    private String translateTableName(String tableName) {
        if (tableName == null) return "未知";
        // t_xxx_yyy → xxx yyy
        String name = tableName.startsWith("t_") ? tableName.substring(2) : tableName;
        // 常见词翻译
        name = name.replace("production", "生产")
                   .replace("material", "物料")
                   .replace("order", "订单")
                   .replace("scan", "扫码")
                   .replace("factory", "工厂")
                   .replace("style", "款式")
                   .replace("quality", "质检")
                   .replace("wage", "工资")
                   .replace("cutting", "裁剪")
                   .replace("stock", "库存")
                   .replace("inbound", "入库")
                   .replace("outstock", "出库")
                   .replace("_", "");
        return name;
    }
}
