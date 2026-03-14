package com.fashion.supplychain.system.service.impl;

import com.fashion.supplychain.system.service.DatabaseStructureHealthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DatabaseStructureHealthServiceImpl implements DatabaseStructureHealthService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private DataSource dataSource;

    @Override
    public Map<String, Object> inspect() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> checks = new ArrayList<>();
        List<String> blockingIssues = new ArrayList<>();
        List<String> recommendations = new ArrayList<>();
        int warningCount = 0;

        result.put("checkedAt", LocalDateTime.now().format(TIME_FORMATTER));

        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            result.put("schema", schema);

            Map<String, Object> flyway = inspectFlyway(conn, schema);
            result.put("flyway", flyway);

            int failedMigrations = (int) flyway.get("failedCount");
            if (failedMigrations > 0) {
                blockingIssues.add("Flyway 存在失败迁移记录 " + failedMigrations + " 条");
                recommendations.add("先处理 flyway_schema_history 中 success=0 的失败迁移，再继续发布。");
            }

            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_style_info", "image_insight", "critical", true,
                    "款式表 AI 图片洞察字段，缺失会阻断下单/款式相关查询");
            warningCount += addTableCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_intelligence_action_task_feedback", "critical", true,
                    "动作中心任务回执表，缺失会导致 intelligence 页面频繁告警");
            warningCount += addTableCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_material_database", "critical", true,
                    "面辅料数据库主表，缺失会导致面辅料库/库存页面异常");
            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_material_database", "material_type", "critical", true,
                    "面辅料类型字段，缺失会导致仓库主数据类型异常");
            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_material_database", "tenant_id", "warning", true,
                    "多租户隔离字段，缺失会影响面辅料数据隔离");
            warningCount += addTableCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_intelligence_metrics", "warning", true,
                    "智能模块度量表，缺失会影响 AI 可观测性");
            warningCount += addTableCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_intelligence_signal", "warning", true,
                    "智能信号表，缺失会影响 intelligence 聚合能力");
            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_production_order", "progress_workflow_json", "critical", false,
                    "生产订单工序工作流字段，缺失会阻断订单创建/编辑");
            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_production_order", "progress_workflow_locked", "warning", false,
                    "生产订单工序锁定字段，缺失会影响流程锁定状态");
            warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                    "t_user", "avatar_url", "warning", true,
                    "用户头像字段，缺失会影响用户资料展示");
                warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                        "t_style_bom", "image_urls", "critical", true,
                    "BOM 物料图片字段，缺失会导致 BOM 图片保存与打印能力不可用");
                warningCount += addColumnCheck(conn, schema, checks, blockingIssues, recommendations,
                        "t_style_size", "image_urls", "critical", true,
                    "尺寸表参考图片字段，缺失会导致尺寸图片分组上传与打印能力不可用");

            boolean healthy = blockingIssues.isEmpty();
            result.put("healthy", healthy);
            result.put("status", healthy ? (warningCount > 0 ? "warning" : "healthy") : "critical");
            result.put("blockingIssueCount", blockingIssues.size());
            result.put("warningCount", warningCount);
            result.put("blockingIssues", blockingIssues);
            result.put("recommendations", recommendations);
            result.put("checks", checks);
            return result;
        } catch (Exception e) {
            result.put("healthy", false);
            result.put("status", "critical");
            result.put("blockingIssueCount", 1);
            result.put("warningCount", 0);
            result.put("blockingIssues", List.of("结构健康检查执行失败: " + e.getMessage()));
            result.put("recommendations", List.of("先确认数据库连接和 INFORMATION_SCHEMA 查询权限是否正常。"));
            result.put("checks", checks);
            result.put("error", e.getMessage());
            return result;
        }
    }

    private Map<String, Object> inspectFlyway(Connection conn, String schema) throws Exception {
        Map<String, Object> flyway = new LinkedHashMap<>();
        if (!tableExists(conn, schema, "flyway_schema_history")) {
            flyway.put("installed", false);
            flyway.put("failedCount", 0);
            flyway.put("latestVersion", null);
            return flyway;
        }

        flyway.put("installed", true);
        flyway.put("failedCount", queryInt(conn,
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0"));
        flyway.put("latestVersion", queryString(conn,
                "SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC LIMIT 1"));
        flyway.put("latestDescription", queryString(conn,
                "SELECT description FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank DESC LIMIT 1"));
        return flyway;
    }

    private int addTableCheck(Connection conn,
                              String schema,
                              List<Map<String, Object>> checks,
                              List<String> blockingIssues,
                              List<String> recommendations,
                              String table,
                              String severity,
                              boolean autoRepairCovered,
                              String description) throws Exception {
        boolean exists = tableExists(conn, schema, table);
        checks.add(buildCheck("table", table, null, severity, exists, autoRepairCovered, description));
        if (exists) {
            return 0;
        }
        handleMissing(blockingIssues, recommendations, severity,
                "缺失表 " + table,
                autoRepairCovered
                        ? "检查启动日志中的 [DbRepair] 是否已执行；若当前版本已上线仍缺失，说明云端仍在旧包或自愈未执行。"
                        : "为该表补充新的 Flyway 迁移脚本，禁止回改已执行迁移。"
        );
        return "warning".equalsIgnoreCase(severity) ? 1 : 0;
    }

    private int addColumnCheck(Connection conn,
                               String schema,
                               List<Map<String, Object>> checks,
                               List<String> blockingIssues,
                               List<String> recommendations,
                               String table,
                               String column,
                               String severity,
                               boolean autoRepairCovered,
                               String description) throws Exception {
        boolean exists = columnExists(conn, schema, table, column);
        checks.add(buildCheck("column", table, column, severity, exists, autoRepairCovered, description));
        if (exists) {
            return 0;
        }
        handleMissing(blockingIssues, recommendations, severity,
                "缺失列 " + table + "." + column,
                autoRepairCovered
                        ? "检查启动日志中的 [DbRepair] 是否已自动补列；若未补上，优先核对当前部署版本是否已包含自愈逻辑。"
                        : "新增 Flyway 迁移脚本补齐该列，并在发布前再次做结构健康检查。"
        );
        return "warning".equalsIgnoreCase(severity) ? 1 : 0;
    }

    private void handleMissing(List<String> blockingIssues,
                               List<String> recommendations,
                               String severity,
                               String issue,
                               String recommendation) {
        if ("critical".equalsIgnoreCase(severity)) {
            blockingIssues.add(issue);
        }
        recommendations.add(recommendation);
    }

    private Map<String, Object> buildCheck(String type,
                                           String table,
                                           String column,
                                           String severity,
                                           boolean exists,
                                           boolean autoRepairCovered,
                                           String description) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("table", table);
        item.put("column", column);
        item.put("severity", severity);
        item.put("status", exists ? "ok" : "missing");
        item.put("autoRepairCovered", autoRepairCovered);
        item.put("description", description);
        return item;
    }

    private boolean tableExists(Connection conn, String schema, String table) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    private boolean columnExists(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    private int queryInt(Connection conn, String sql) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    private String queryString(Connection conn, String sql) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            return rs.next() ? rs.getString(1) : null;
        }
    }
}
