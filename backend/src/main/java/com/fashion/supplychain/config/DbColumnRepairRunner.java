package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.fashion.supplychain.service.RedisService;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@ConditionalOnProperty(name = "fashion.db.repair-enabled", havingValue = "true", matchIfMissing = true)
@Component
@Order(10)
@Slf4j
public class DbColumnRepairRunner implements ApplicationRunner {

    @Autowired
    private DataSource dataSource;

    @Autowired(required = false)
    private RedisService redisService;

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    @Override
    public void run(ApplicationArguments args) {
        // 本次启动实际"动过"的结构，逐条记下来，最后统一输出
        List<String> actions = new ArrayList<>();
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            int repaired = 0;
            int repairedTables = 0;

            // 2026-04-28：必须先建表再补列，避免列修复时表不存在导致 ALTER 失败 silently
            for (Map.Entry<String, String> entry : DbTableDefinitions.TABLE_FIXES.entrySet()) {
                if (!tableExists(conn, schema, entry.getKey())) {
                    try (Statement stmt = conn.createStatement()) {
                        stmt.execute(entry.getValue());
                    } catch (Exception e) {
                        log.error("[DbRepair] 创建缺失表 {} 失败：{}", entry.getKey(), e.getMessage());
                        continue;
                    }
                    // ⚠️ ERROR 而非 warn：缺表意味着 Flyway 迁移缺失或没跑成功，
                    //    这是结构真相源问题，必须能在监控里被看见（2026-10-14 从 warn 提级）
                    log.error("[DbRepair] 已创建缺失表 {} —— Flyway 迁移缺失或未执行，请补齐迁移", entry.getKey());
                    actions.add("表 " + entry.getKey());
                    repairedTables++;
                }
            }

            for (Map.Entry<String, List<String[]>> entry : DbColumnDefinitions.COLUMN_FIXES.entrySet()) {
                String table = entry.getKey();
                List<String[]> columns = entry.getValue();
                Set<String> existingColumns = getExistingColumns(conn, schema, table);
                if (existingColumns.isEmpty()) {
                    // 表不存在（既不在 TABLE_FIXES 中，也未由 Flyway 创建），跳过列修复以免产生大量噪音错误日志
                    continue;
                }
                for (String[] col : columns) {
                    if (!existingColumns.contains(col[0])) {
                        if (addColumn(conn, table, col[0], col[1]) > 0) {
                            log.error("[DbRepair] 已补缺失列 {}.{} —— Flyway 迁移缺失或未执行，请补齐迁移",
                                    table, col[0]);
                            actions.add(table + "." + col[0]);
                        }
                    }
                }
            }

            repaired += DbViewRepairHelper.ensureSettlementViewHasCompleteTime(conn, schema);
            // 下面两个是"每次启动强制同步"视图（无条件 CREATE OR REPLACE 且恒返回1），
            // 属例行刷新非缺失修复，不计入 repaired——否则每次启动都误报"共修复 2 个缺失列"
            DbViewRepairHelper.ensureFlowStageSnapshotView(conn, schema);
            DbViewRepairHelper.ensureStageDoneAggView(conn, schema);
            if (ensureColumnType(conn, schema, "t_style_info", "size_color_config",
                    "mediumtext", "MODIFY COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'") > 0) {
                actions.add("t_style_info.size_color_config(类型修正)");
            }
            if (ensureColumnType(conn, schema, "t_style_size", "tolerance",
                    "varchar", "MODIFY COLUMN `tolerance` VARCHAR(50) DEFAULT NULL") > 0) {
                actions.add("t_style_size.tolerance(类型修正)");
            }
            if (ensureColumnType(conn, schema, "t_production_process_tracking", "id",
                    "varchar", "MODIFY COLUMN `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）'") > 0) {
                actions.add("t_production_process_tracking.id(类型修正)");
            }
            if (ensureColumnIsNullable(conn, schema, "t_style_attachment", "style_no", "VARCHAR(64)") > 0) {
                actions.add("t_style_attachment.style_no(可空性修正)");
            }
            repaired += actions.size();
        } catch (Exception e) {
            log.error("[DbRepair] 列修复失败，应用继续启动。原因: {}", e.getMessage());
        }

        if (redisService != null) {
            try {
                long deleted = redisService.deleteByPattern("role:perms:*");
                if (deleted > 0) {
                    log.info("[DbRepair] 已清理 {} 个 role:perms:* 旧格式权限缓存", deleted);
                }
            } catch (Exception e) {
                log.warn("[DbRepair] role:perms:* 缓存清理失败（忽略）: {}", e.getMessage());
            }
        }

        ensureCriticalCompositeIndexes();

        reportRepairSummary(actions);
    }

    /**
     * 汇总本次启动动过的结构。
     *
     * <p><b>为什么要有这一行</b>（2026-10-14）：这个自愈器此前每次动手都只打一条
     * {@code log.warn}，散落在几百行启动日志里，**没有任何告警会注意到它**。
     * 后果是 Flyway 漂移被它悄悄盖住 —— 结构真相源本该只有 Flyway，
     * 现在却有两套，谁错了看不出来。本次把每次动手提到 ERROR，
     * 并在最后单独汇总一行，方便 grep / 配告警。
     *
     * <p>保留自愈行为本身：老库/缺表的部署场景仍需要兜底，不能一关了之。
     */
    private void reportRepairSummary(List<String> actions) {
        if (actions.isEmpty()) {
            log.info("[DbRepair] 关键表结构完整，无需修复（结构真相源=Flyway，无漂移）");
            return;
        }
        // 最多列 10 条，避免极端情况下刷屏
        List<String> shown = actions.size() > 10 ? actions.subList(0, 10) : actions;
        String more = actions.size() > 10 ? " …等共 " + actions.size() + " 处" : "";
        log.error("[DbRepair] ⚠ 本次启动修复了 {} 处结构缺失：{}{}。"
                        + "这意味着 Flyway 迁移缺失或未执行 —— 结构真相源只能是 Flyway，请补齐迁移后本处应归零",
                actions.size(), String.join(", ", shown), more);
    }

    private void ensureCriticalCompositeIndexes() {
        int created = 0;
        if (dbHelper.tableExists("t_scan_record")) {
            if (dbHelper.addIndexIfAbsent("t_scan_record", "idx_sr_tenant_order", "tenant_id, order_id")) created++;
            if (dbHelper.addIndexIfAbsent("t_scan_record", "idx_sr_tenant_scantime", "tenant_id, scan_time")) created++;
        }
        if (dbHelper.tableExists("t_product_warehousing")) {
            if (dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_pw_tenant_order_delete", "tenant_id, order_id, delete_flag")) created++;
        }
        if (dbHelper.tableExists("t_production_process_tracking")) {
            if (dbHelper.addIndexIfAbsent("t_production_process_tracking", "idx_ppt_tenant_order", "tenant_id, production_order_id")) created++;
            if (dbHelper.addIndexIfAbsent("t_production_process_tracking", "idx_ppt_tenant_bundle", "tenant_id, cutting_bundle_id")) created++;
        }
        if (dbHelper.tableExists("t_material_purchase")) {
            if (dbHelper.addIndexIfAbsent("t_material_purchase", "idx_mpu_tenant_order", "tenant_id, order_id")) created++;
        }
        if (created > 0) {
            log.error("[DbRepair] 已创建 {} 个缺失联合索引 —— Flyway 迁移缺失或未执行，请补齐迁移", created);
        }
    }

    private Set<String> getExistingColumns(Connection conn, String schema, String table) {
        try {
            String sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, schema);
                ps.setString(2, table);
                try (ResultSet rs = ps.executeQuery()) {
                    java.util.Set<String> cols = new java.util.HashSet<>();
                    while (rs.next()) {
                        cols.add(rs.getString(1));
                    }
                    return cols;
                }
            }
        } catch (Exception e) {
            log.error("[DbRepair] 查询表 {} 列信息失败: {}", table, e.getMessage());
            return java.util.Collections.emptySet();
        }
    }

    private int addColumn(Connection conn, String table, String column, String definition) {
        try {
            String sql = DdlSafeBuilder.alterTableAddColumn(table, column, definition);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.executeUpdate();
            }
            log.warn("[DbRepair] 已添加缺失列: {}.{}", table, column);
            return 1;
        } catch (Exception e) {
            log.error("[DbRepair] 添加列 {}.{} 失败: {}", table, column, e.getMessage());
            return 0;
        }
    }

    private int ensureColumnIsNullable(Connection conn, String schema, String table, String column, String typeDefinition) {
        try {
            String checkSql = "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
            String isNullable;
            try (PreparedStatement ps = conn.prepareStatement(checkSql)) {
                ps.setString(1, schema);
                ps.setString(2, table);
                ps.setString(3, column);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return 0;
                    isNullable = rs.getString(1);
                }
            }
            if ("NO".equalsIgnoreCase(isNullable)) {
                String sql = DdlSafeBuilder.alterTableModifyColumn(table, column, typeDefinition);
                try (PreparedStatement ps = conn.prepareStatement(sql)) {
                    ps.executeUpdate();
                }
                log.warn("[DbRepair] 已修正列为可空: {}.{}", table, column);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 检查/修复列可空性 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private int ensureColumnType(Connection conn, String schema, String table, String column,
            String expectedTypePrefix, String alterFragment) {
        try {
            String actualType = getColumnType(conn, schema, table, column);
            if (actualType == null || actualType.toLowerCase().startsWith(expectedTypePrefix.toLowerCase())) {
                return 0;
            }
            String sql = DdlSafeBuilder.alterTableModifyFragment(table, alterFragment);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.executeUpdate();
            }
            log.warn("[DbRepair] 已修正列类型: {}.{} {} -> {}", table, column, actualType, expectedTypePrefix);
            return 1;
        } catch (Exception e) {
            log.error("[DbRepair] 修正列类型 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private int ensureColumn(Connection conn, String schema, String table, String column, String definition) {
        try {
            if (DbViewRepairHelper.columnExists(conn, schema, table, column)) return 0;
            String sql = DdlSafeBuilder.alterTableAddColumn(table, column, definition);
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.executeUpdate();
            }
            log.warn("[DbRepair] 已补列: {}.{} {}", table, column, definition);
            return 1;
        } catch (Exception e) {
            log.error("[DbRepair] 补列 {}.{} 失败: {}", table, column, e.getMessage());
            return 0;
        }
    }

    private String getColumnType(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getString(1);
                }
            }
        }
        return null;
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
}
