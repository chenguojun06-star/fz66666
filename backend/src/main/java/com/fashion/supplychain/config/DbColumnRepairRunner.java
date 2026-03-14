package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 启动时自动修复关键业务表可能缺失的列。
 * 独立于 Flyway 运行——即使 Flyway 迁移被阻塞/跳过，本 Runner 也能保证关键列存在。
 * 所有操作均为幂等（先查 INFORMATION_SCHEMA，不存在才 ALTER TABLE）。
 */
@Component
@Order(10)
@Slf4j
public class DbColumnRepairRunner implements ApplicationRunner {

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            int repaired = 0;

            repaired += ensureColumn(conn, schema, "t_user", "factory_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '外发工厂ID'");
            repaired += ensureColumn(conn, schema, "t_user", "is_factory_owner",
                    "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为外发工厂主账号'");
            repaired += ensureColumn(conn, schema, "t_user", "org_unit_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '所属组织节点ID'");
            repaired += ensureColumn(conn, schema, "t_user", "org_unit_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '所属组织节点名称'");
            repaired += ensureColumn(conn, schema, "t_user", "org_path",
                    "VARCHAR(500) DEFAULT NULL COMMENT '所属组织路径'");
            repaired += ensureColumn(conn, schema, "t_user", "avatar_url",
                    "VARCHAR(255) DEFAULT NULL COMMENT '用户头像URL'");

            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_type",
                    "VARCHAR(32) DEFAULT NULL COMMENT '开发来源类型：SELF_DEVELOPED / SELECTION_CENTER'");
            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_detail",
                    "VARCHAR(64) DEFAULT NULL COMMENT '开发来源明细：自主开发 / 选品中心'");
            repaired += ensureColumn(conn, schema, "t_style_info", "image_insight",
                    "VARCHAR(500) DEFAULT NULL COMMENT 'AI图片洞察'");
                repaired += ensureColumn(conn, schema, "t_style_bom", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '物料图片URLs(JSON数组)' ");
                repaired += ensureColumn(conn, schema, "t_style_size", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '部位参考图片URLs(JSON数组)' ");
                repaired += ensureColumn(conn, schema, "t_style_size", "group_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '尺寸分组名，如上装区/下装区' ");

            int repairedTables = 0;
                repairedTables += ensureTable(conn, schema,
                    "t_material_database",
                    "CREATE TABLE IF NOT EXISTS `t_material_database` ("
                        + "`id` VARCHAR(36) NOT NULL,"
                        + "`material_code` VARCHAR(50) NOT NULL,"
                        + "`material_name` VARCHAR(100) NOT NULL,"
                        + "`style_no` VARCHAR(50) DEFAULT NULL,"
                        + "`material_type` VARCHAR(20) DEFAULT 'accessory',"
                        + "`color` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_width` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_weight` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_composition` VARCHAR(100) DEFAULT NULL,"
                        + "`specifications` VARCHAR(100) DEFAULT NULL,"
                        + "`unit` VARCHAR(20) NOT NULL DEFAULT '',"
                        + "`supplier_id` VARCHAR(36) DEFAULT NULL,"
                        + "`supplier_name` VARCHAR(100) DEFAULT NULL,"
                        + "`supplier_contact_person` VARCHAR(100) DEFAULT NULL,"
                        + "`supplier_contact_phone` VARCHAR(50) DEFAULT NULL,"
                        + "`unit_price` DECIMAL(10,2) DEFAULT 0.00,"
                        + "`description` VARCHAR(255) DEFAULT NULL,"
                        + "`image` VARCHAR(500) DEFAULT NULL,"
                        + "`remark` VARCHAR(500) DEFAULT NULL,"
                        + "`status` VARCHAR(20) DEFAULT 'pending',"
                        + "`completed_time` DATETIME DEFAULT NULL,"
                        + "`return_reason` VARCHAR(255) DEFAULT NULL,"
                        + "`tenant_id` BIGINT DEFAULT NULL,"
                        + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
                        + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "`delete_flag` INT NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_material_code` (`material_code`),"
                        + "KEY `idx_style_no` (`style_no`),"
                        + "KEY `idx_supplier_name` (`supplier_name`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料数据库'");
                repaired += ensureColumn(conn, schema, "t_material_database", "color",
                    "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_width",
                    "VARCHAR(50) DEFAULT NULL COMMENT '门幅'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_weight",
                    "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_composition",
                    "VARCHAR(100) DEFAULT NULL COMMENT '成分'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_id",
                    "VARCHAR(36) DEFAULT NULL COMMENT '供应商ID'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_contact_person",
                    "VARCHAR(100) DEFAULT NULL COMMENT '供应商联系人'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_contact_phone",
                    "VARCHAR(50) DEFAULT NULL COMMENT '供应商联系电话'");
                repaired += ensureColumn(conn, schema, "t_material_database", "tenant_id",
                    "BIGINT DEFAULT NULL COMMENT '租户ID'");
                repairedTables += ensureTable(conn, schema,
                    "t_intelligence_metrics",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` ("
                        + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                        + "`tenant_id` BIGINT NOT NULL,"
                        + "`scene` VARCHAR(100) NOT NULL,"
                        + "`provider` VARCHAR(50) DEFAULT NULL,"
                        + "`model` VARCHAR(100) DEFAULT NULL,"
                        + "`trace_id` VARCHAR(64) DEFAULT NULL,"
                        + "`trace_url` VARCHAR(500) DEFAULT NULL,"
                        + "`success` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "`fallback_used` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "`latency_ms` INT DEFAULT NULL,"
                        + "`prompt_chars` INT DEFAULT NULL,"
                        + "`response_chars` INT DEFAULT NULL,"
                        + "`tool_call_count` INT DEFAULT NULL,"
                        + "`error_message` VARCHAR(500) DEFAULT NULL,"
                        + "`user_id` VARCHAR(64) DEFAULT NULL,"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                        + "`delete_flag` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_metrics_tenant_scene` (`tenant_id`, `scene`, `create_time`),"
                        + "KEY `idx_metrics_create_time` (`create_time`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能模块AI调用度量表'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "trace_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT 'AI调用追踪ID'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "trace_url",
                    "VARCHAR(500) DEFAULT NULL COMMENT '外部观测平台Trace链接'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "tool_call_count",
                    "INT DEFAULT NULL COMMENT '本次AI调用工具次数'");
                repairedTables += ensureTable(conn, schema,
                    "t_intelligence_signal",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_signal` ("
                        + "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,"
                        + "`tenant_id` BIGINT NOT NULL,"
                        + "`signal_type` VARCHAR(50) NOT NULL,"
                        + "`signal_code` VARCHAR(100) NOT NULL,"
                        + "`signal_level` VARCHAR(20) NOT NULL DEFAULT 'info',"
                        + "`source_domain` VARCHAR(50) DEFAULT NULL,"
                        + "`source_id` VARCHAR(100) DEFAULT NULL,"
                        + "`source_name` VARCHAR(200) DEFAULT NULL,"
                        + "`signal_title` VARCHAR(500) DEFAULT NULL,"
                        + "`signal_detail` TEXT DEFAULT NULL,"
                        + "`signal_analysis` TEXT DEFAULT NULL,"
                        + "`related_ids` VARCHAR(500) DEFAULT NULL,"
                        + "`priority_score` INT NOT NULL DEFAULT 50,"
                        + "`status` VARCHAR(20) NOT NULL DEFAULT 'open',"
                        + "`resolved_at` DATETIME DEFAULT NULL,"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                        + "`update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "`delete_flag` INT NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_tenant_status` (`tenant_id`, `status`, `create_time`),"
                        + "KEY `idx_tenant_level` (`tenant_id`, `signal_level`, `priority_score`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一智能信号表'");
            repairedTables += ensureTable(conn, schema,
                    "t_intelligence_action_task_feedback",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_action_task_feedback` ("
                            + "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,"
                            + "`tenant_id` BIGINT NOT NULL,"
                            + "`task_code` VARCHAR(100) NOT NULL,"
                            + "`related_order_no` VARCHAR(64) DEFAULT NULL,"
                            + "`feedback_status` VARCHAR(32) NOT NULL,"
                            + "`feedback_reason` VARCHAR(500) DEFAULT NULL,"
                            + "`completion_note` VARCHAR(500) DEFAULT NULL,"
                            + "`source_signal` VARCHAR(100) DEFAULT NULL,"
                            + "`next_review_at` VARCHAR(32) DEFAULT NULL,"
                            + "`operator_id` VARCHAR(64) DEFAULT NULL,"
                            + "`operator_name` VARCHAR(100) DEFAULT NULL,"
                            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                            + "`update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                            + "`delete_flag` INT NOT NULL DEFAULT 0,"
                            + "PRIMARY KEY (`id`),"
                            + "KEY `idx_tenant_task` (`tenant_id`, `task_code`, `related_order_no`, `create_time`),"
                            + "KEY `idx_tenant_status` (`tenant_id`, `feedback_status`, `create_time`)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动作中心任务回执表'");

            if (repaired > 0) {
                log.warn("[DbRepair] 共修复 {} 个缺失列，Flyway 可能未正常执行对应迁移脚本", repaired);
            }
            if (repairedTables > 0) {
                log.warn("[DbRepair] 共修复 {} 张缺失表，Flyway/DataInitializer 可能未正常执行", repairedTables);
            }
            if (repaired == 0 && repairedTables == 0) {
                log.info("[DbRepair] 关键表结构完整，无需修复");
            }
        } catch (Exception e) {
            log.error("[DbRepair] 列修复失败，应用继续启动。原因: {}", e.getMessage());
        }
    }

    private int ensureColumn(Connection conn, String schema, String table, String column, String definition) {
        try {
            if (!columnExists(conn, schema, table, column)) {
                String sql = "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition;
                try (PreparedStatement ps = conn.prepareStatement(sql)) {
                    ps.executeUpdate();
                }
                log.warn("[DbRepair] 已添加缺失列: {}.{}", table, column);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 添加列 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private int ensureTable(Connection conn, String schema, String table, String createSql) {
        try {
            if (!tableExists(conn, schema, table)) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.execute(createSql);
                }
                log.warn("[DbRepair] 已创建缺失表: {}", table);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 创建表 {} 失败: {}", table, e.getMessage());
        }
        return 0;
    }

    private boolean columnExists(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
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
