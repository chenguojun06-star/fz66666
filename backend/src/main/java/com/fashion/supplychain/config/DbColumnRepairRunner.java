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

/**
 * 启动时自动修复 t_user 表可能缺失的列。
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

            if (repaired > 0) {
                log.warn("[DbRepair] 共修复 {} 个缺失列，Flyway 可能未正常执行对应迁移脚本", repaired);
            } else {
                log.info("[DbRepair] t_user 表结构完整，无需修复");
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
}
