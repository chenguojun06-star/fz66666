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

    @Autowired(required = false)
    private RedisService redisService;

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

            repaired += ensureColumn(conn, schema, "t_material_purchase", "evidence_image_urls",
                    "TEXT DEFAULT NULL COMMENT '回料确认凭证图片URLs（逗号分隔）'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "fabric_composition",
                    "VARCHAR(500) DEFAULT NULL COMMENT '面料成分（从物料资料库同步）'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "invoice_urls",
                    "TEXT DEFAULT NULL COMMENT '发票/单据图片URL列表(JSON数组)，用于财务留底'");

                repaired += ensureColumn(conn, schema, "t_mind_push_rule", "notify_time_start",
                    "VARCHAR(5) NOT NULL DEFAULT '08:00' COMMENT '推送开始时间 HH:mm'");
                repaired += ensureColumn(conn, schema, "t_mind_push_rule", "notify_time_end",
                    "VARCHAR(5) NOT NULL DEFAULT '22:00' COMMENT '推送结束时间 HH:mm'");

            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_type",
                    "VARCHAR(32) DEFAULT NULL COMMENT '开发来源类型：SELF_DEVELOPED / SELECTION_CENTER'");
            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_detail",
                    "VARCHAR(64) DEFAULT NULL COMMENT '开发来源明细：自主开发 / 选品中心'");
            repaired += ensureColumn(conn, schema, "t_style_info", "image_insight",
                    "VARCHAR(500) DEFAULT NULL COMMENT 'AI图片洞察'");
            repaired += ensureColumn(conn, schema, "t_style_info", "fabric_composition",
                    "VARCHAR(500) DEFAULT NULL COMMENT '面料成分，如：70%棉 30%涤纶'");
            repaired += ensureColumn(conn, schema, "t_style_info", "wash_instructions",
                    "VARCHAR(500) DEFAULT NULL COMMENT '洗涤说明，如：30°C水洗，不可漂白'");
            repaired += ensureColumn(conn, schema, "t_style_info", "u_code",
                    "VARCHAR(100) DEFAULT NULL COMMENT 'U编码/品质追溯码，用于吊牌打印'");
            repaired += ensureColumn(conn, schema, "t_style_info", "wash_temp_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '洗涤温度代码：W30/W40/W60/W95/HAND/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "bleach_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '漂白代码：ANY/NON_CHL/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "tumble_dry_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '烘干代码：NORMAL/LOW/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "iron_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '熨烫代码：LOW/MED/HIGH/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "dry_clean_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '干洗代码：YES/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "fabric_composition_parts",
                    "TEXT DEFAULT NULL COMMENT '多部位面料成分JSON:[{part,materials}]'");
            repaired += ensureColumn(conn, schema, "t_style_info", "update_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '最后维护人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_locked",
                    "INT NOT NULL DEFAULT 1 COMMENT '制单锁定:1=已锁定,0=退回可编辑'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_comment",
                    "VARCHAR(500) DEFAULT NULL COMMENT '制单退回备注'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '制单退回人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_time",
                    "DATETIME DEFAULT NULL COMMENT '制单退回时间'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_locked",
                    "INT NOT NULL DEFAULT 0 COMMENT '纸样修改锁定:1=已提交,0=可提交'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_comment",
                    "VARCHAR(500) DEFAULT NULL COMMENT '纸样退回备注'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '纸样退回人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_time",
                    "DATETIME DEFAULT NULL COMMENT '纸样退回时间'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '物料图片URLs(JSON数组)' ");
            repaired += ensureColumn(conn, schema, "t_style_bom", "fabric_composition",
                    "VARCHAR(100) DEFAULT NULL COMMENT '物料成分，优先从面辅料资料带入' ");
            repaired += ensureColumn(conn, schema, "t_style_bom", "size_usage_map",
                    "TEXT DEFAULT NULL COMMENT '码数用量配比(JSON，格式：{\"S\":1.5,\"M\":1.6,\"L\":1.7}，为空则统一用usageAmount)'");
            repaired += ensureColumn(conn, schema, "t_style_size", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '部位参考图片URLs(JSON数组)' ");
            repaired += ensureColumn(conn, schema, "t_style_size", "group_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '尺寸分组名，如上装区/下装区' ");
            repaired += ensureColumnType(conn, schema, "t_production_process_tracking", "id",
                    "varchar", "MODIFY COLUMN `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）'");

            int repairedTables = 0;
                repairedTables += ensureTable(conn, schema,
                    "t_hyper_advisor_session",
                    "CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                    + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                    + "`user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',"
                    + "`session_id` VARCHAR(128) NOT NULL COMMENT '会话ID',"
                    + "`role` VARCHAR(32) DEFAULT NULL COMMENT '消息角色（user/assistant/system）',"
                    + "`content` LONGTEXT DEFAULT NULL COMMENT '消息内容',"
                    + "`metadata_json` TEXT DEFAULT NULL COMMENT '元数据JSON',"
                    + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                    + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标记（0正常 1删除）',"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_session_id` (`session_id`),"
                    + "KEY `idx_tenant_user` (`tenant_id`, `user_id`),"
                    + "KEY `idx_tenant_create` (`tenant_id`, `create_time`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录'");
                repairedTables += ensureTable(conn, schema,
                    "t_advisor_feedback",
                    "CREATE TABLE IF NOT EXISTS `t_advisor_feedback` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                    + "`tenant_id` BIGINT NOT NULL,"
                    + "`user_id` VARCHAR(64) NOT NULL,"
                    + "`session_id` VARCHAR(64) NOT NULL,"
                    + "`trace_id` VARCHAR(64) DEFAULT NULL COMMENT 'Langfuse trace ID',"
                    + "`query_text` TEXT NOT NULL COMMENT '用户原始提问',"
                    + "`advice_text` TEXT NOT NULL COMMENT 'AI建议摘要',"
                    + "`score` DOUBLE NOT NULL DEFAULT 0 COMMENT '评分 0~1（1=好建议）',"
                    + "`feedback_text` VARCHAR(500) DEFAULT NULL COMMENT '用户文字反馈',"
                    + "`harvested` TINYINT NOT NULL DEFAULT 0 COMMENT '是否已提炼为知识库条目 0=未 1=已',"
                    + "`harvested_kb_id` VARCHAR(64) DEFAULT NULL COMMENT '提炼后写入 t_knowledge_base 的记录ID',"
                    + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_feedback_harvest` (`harvested`, `score`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-反馈与知识提炼'");
                repairedTables += ensureTable(conn, schema,
                    "t_ai_user_profile",
                    "CREATE TABLE IF NOT EXISTS `t_ai_user_profile` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                    + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                    + "`user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',"
                    + "`behavior_summary` TEXT DEFAULT NULL COMMENT '行为摘要（AI生成）',"
                    + "`preferences_json` LONGTEXT DEFAULT NULL COMMENT '偏好JSON',"
                    + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                    + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
                    + "PRIMARY KEY (`id`),"
                    + "UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`),"
                    + "KEY `idx_tenant_id` (`tenant_id`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像'");
            repairedTables += ensureTable(conn, schema,
                    "t_purchase_order_doc",
                    "CREATE TABLE IF NOT EXISTS `t_purchase_order_doc` ("
                        + "`id` VARCHAR(36) NOT NULL,"
                        + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                        + "`order_no` VARCHAR(100) NOT NULL COMMENT '关联订单编号',"
                        + "`image_url` VARCHAR(1000) NOT NULL COMMENT '单据图片COS访问URL',"
                        + "`raw_text` TEXT DEFAULT NULL COMMENT 'AI识别原始文字',"
                        + "`match_count` INT NOT NULL DEFAULT 0 COMMENT '已匹配条目数',"
                        + "`total_recognized` INT NOT NULL DEFAULT 0 COMMENT 'AI识别出的条目总数',"
                        + "`uploader_id` VARCHAR(36) DEFAULT NULL COMMENT '上传人ID',"
                        + "`uploader_name` VARCHAR(100) DEFAULT NULL COMMENT '上传人姓名',"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',"
                        + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '0=正常 1=删除',"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_pod_order_no` (`order_no`),"
                        + "KEY `idx_pod_tenant_id` (`tenant_id`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='采购单据上传记录表'");
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

            // t_secondary_process 二次工艺图片/附件字段（V20260501002 可能未执行）
            repaired += ensureColumn(conn, schema, "t_secondary_process", "images",
                    "TEXT DEFAULT NULL COMMENT '工艺图片URL列表(JSON数组)'");
            repaired += ensureColumn(conn, schema, "t_secondary_process", "attachments",
                    "TEXT DEFAULT NULL COMMENT '工艺附件列表(JSON数组，格式[{name,url}])'");

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

        // 清理旧格式 role:perms:* 缓存（一次性，启动时执行）
        // 避免登录时因缓存命中旧数据而多走一次 DB
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

    private String getColumnType(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
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
