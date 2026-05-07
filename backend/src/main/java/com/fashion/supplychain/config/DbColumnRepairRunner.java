package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.fashion.supplychain.service.RedisService;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            int repaired = 0;
            int repairedTables = 0;

            // 2026-04-28：必须先建表再补列，避免列修复时表不存在导致 ALTER 失败 silently
            for (Map.Entry<String, String> entry : DbTableDefinitions.TABLE_FIXES.entrySet()) {
                if (!tableExists(conn, schema, entry.getKey())) {
                    try (Statement stmt = conn.createStatement()) {
                        stmt.execute(entry.getValue());
                    }
                    log.warn("[DbRepair] 已创建缺失表: {}", entry.getKey());
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
                        repaired += addColumn(conn, table, col[0], col[1]);
                    }
                }
            }

            repaired += DbViewRepairHelper.ensureSettlementViewHasCompleteTime(conn, schema);
            repaired += DbViewRepairHelper.ensureFlowStageSnapshotView(conn, schema);
            repaired += DbViewRepairHelper.ensureStageDoneAggView(conn, schema);
            repaired += ensureColumnType(conn, schema, "t_style_info", "size_color_config",
                    "mediumtext", "MODIFY COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'");
            repaired += ensureColumnType(conn, schema, "t_style_size", "tolerance",
                    "varchar", "MODIFY COLUMN `tolerance` VARCHAR(50) DEFAULT NULL");
            repaired += ensureColumnType(conn, schema, "t_production_process_tracking", "id",
                    "varchar", "MODIFY COLUMN `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）'");
            repaired += ensureColumnIsNullable(conn, schema, "t_style_attachment", "style_no", "VARCHAR(64)");
            if (repaired > 0) {
                log.warn("[DbRepair] 共修复 {} 个缺失列", repaired);
            }
            if (repairedTables > 0) {
                log.warn("[DbRepair] 共修复 {} 张缺失表", repairedTables);
            }
            if (repaired == 0 && repairedTables == 0) {
                log.info("[DbRepair] 关键表结构完整，无需修复");
            }
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
            log.warn("[DbRepair] 已创建 {} 个缺失联合索引", created);
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
            String sql = "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition;
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
                String sql = "ALTER TABLE `" + table + "` MODIFY COLUMN `" + column + "` " + typeDefinition + " DEFAULT NULL";
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
            String sql = "ALTER TABLE `" + table + "` " + alterFragment;
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
            String sql = "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition;
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
