-- ============================================================
-- 云端数据库完整同步脚本 (幂等版本)
-- 版本: 2026-03-28
-- 功能: 同步所有缺失的表和列
-- 执行方式: 全部复制到云端数据库查询窗口一次性执行
-- ============================================================

-- 1. 创建缺失的intelligence相关表 (IF NOT EXISTS 天然幂等)
CREATE TABLE IF NOT EXISTS `t_intelligence_signal` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `signal_type` VARCHAR(50) DEFAULT NULL,
    `signal_source` VARCHAR(100) DEFAULT NULL,
    `signal_data` TEXT DEFAULT NULL,
    `severity` VARCHAR(20) DEFAULT 'info',
    `status` VARCHAR(20) DEFAULT 'new',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_type` (`tenant_id`, `signal_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能信号表';

CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `metric_type` VARCHAR(50) DEFAULT NULL,
    `metric_value` DECIMAL(15,2) DEFAULT NULL,
    `metric_date` DATE DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_type` (`tenant_id`, `metric_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能指标表';

CREATE TABLE IF NOT EXISTS `t_tenant_intelligence_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `profile_data` TEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户智能画像';

CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(128) NOT NULL,
    `role` VARCHAR(32) DEFAULT NULL,
    `content` LONGTEXT DEFAULT NULL,
    `metadata_json` TEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `delete_flag` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_session_id` (`session_id`),
    KEY `idx_tenant_user` (`tenant_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超级顾问会话记录';

CREATE TABLE IF NOT EXISTS `t_ai_user_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `behavior_summary` TEXT DEFAULT NULL,
    `preferences_json` LONGTEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI用户画像';

CREATE TABLE IF NOT EXISTS `t_ai_conversation_memory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `user_id` VARCHAR(64) DEFAULT NULL,
    `session_id` VARCHAR(128) DEFAULT NULL,
    `role` VARCHAR(32) DEFAULT NULL,
    `content` LONGTEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话记忆';

CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `meeting_type` VARCHAR(50) DEFAULT NULL,
    `topic` VARCHAR(300) DEFAULT NULL,
    `participants` TEXT DEFAULT NULL,
    `agenda` TEXT DEFAULT NULL,
    `debate_rounds` TEXT DEFAULT NULL,
    `consensus` TEXT DEFAULT NULL,
    `dissent` TEXT DEFAULT NULL,
    `action_items` TEXT DEFAULT NULL,
    `confidence_score` INT DEFAULT NULL,
    `linked_decision_ids` VARCHAR(500) DEFAULT NULL,
    `linked_rca_ids` VARCHAR(500) DEFAULT NULL,
    `duration_ms` BIGINT DEFAULT NULL,
    `status` VARCHAR(20) DEFAULT 'concluded',
    `delete_flag` INT NOT NULL DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_am_tenant_type` (`tenant_id`, `meeting_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent例会';

CREATE TABLE IF NOT EXISTS `t_advisor_feedback` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `user_id` VARCHAR(64) DEFAULT NULL,
    `session_id` VARCHAR(64) DEFAULT NULL,
    `trace_id` VARCHAR(64) DEFAULT NULL,
    `query_text` TEXT DEFAULT NULL,
    `advice_text` TEXT DEFAULT NULL,
    `score` DOUBLE DEFAULT 0,
    `feedback_text` VARCHAR(500) DEFAULT NULL,
    `harvested` INT NOT NULL DEFAULT 0,
    `harvested_kb_id` VARCHAR(64) DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_feedback_harvest` (`harvested`, `score`),
    KEY `idx_feedback_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超级顾问反馈';

CREATE TABLE IF NOT EXISTS `t_decision_memory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `decision_type` VARCHAR(50) DEFAULT NULL,
    `context` TEXT DEFAULT NULL,
    `decision` TEXT DEFAULT NULL,
    `outcome` TEXT DEFAULT NULL,
    `confidence` INT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_type` (`tenant_id`, `decision_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='决策记忆';

CREATE TABLE IF NOT EXISTS `t_agent_execution_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `agent_name` VARCHAR(100) DEFAULT NULL,
    `action` VARCHAR(200) DEFAULT NULL,
    `input_data` TEXT DEFAULT NULL,
    `output_data` TEXT DEFAULT NULL,
    `status` VARCHAR(20) DEFAULT NULL,
    `error_message` TEXT DEFAULT NULL,
    `duration_ms` BIGINT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_agent` (`tenant_id`, `agent_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent执行日志';

CREATE TABLE IF NOT EXISTS `t_order_learning_outcome` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `order_id` VARCHAR(64) DEFAULT NULL,
    `order_no` VARCHAR(50) DEFAULT NULL,
    `decision_snapshot_id` BIGINT DEFAULT NULL,
    `actual_factory_id` VARCHAR(64) DEFAULT NULL,
    `actual_factory_name` VARCHAR(100) DEFAULT NULL,
    `planned_finish_date` DATETIME DEFAULT NULL,
    `actual_finish_date` DATETIME DEFAULT NULL,
    `planned_quantity` INT DEFAULT NULL,
    `actual_quantity` INT DEFAULT NULL,
    `defect_rate` DECIMAL(5,2) DEFAULT NULL,
    `cost_variance` DECIMAL(10,2) DEFAULT NULL,
    `time_variance_days` INT DEFAULT NULL,
    `overall_score` INT DEFAULT NULL,
    `learning_notes` TEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_order` (`tenant_id`, `order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单学习结果';

CREATE TABLE IF NOT EXISTS `t_style_secondary_process` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `style_id` VARCHAR(64) DEFAULT NULL,
    `process_name` VARCHAR(100) DEFAULT NULL,
    `process_type` VARCHAR(50) DEFAULT NULL,
    `description` VARCHAR(500) DEFAULT NULL,
    `unit_price` DECIMAL(10,2) DEFAULT NULL,
    `supplier` VARCHAR(100) DEFAULT NULL,
    `lead_time_days` INT DEFAULT NULL,
    `quality_requirement` VARCHAR(500) DEFAULT NULL,
    `media_urls` TEXT DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_style` (`tenant_id`, `style_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款式二次工艺';

-- 2. 幂等补列存储过程
DROP PROCEDURE IF EXISTS SafeAddColumn;

DELIMITER //

CREATE PROCEDURE SafeAddColumn(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition VARCHAR(500)
)
BEGIN
    SET @col_exists = (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND COLUMN_NAME = p_column
    );
    
    IF @col_exists = 0 THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

-- 3. 补充 t_production_order 缺失的列
CALL SafeAddColumn('t_production_order', 'qr_code', 'VARCHAR(100) COMMENT "订单二维码内容"');
CALL SafeAddColumn('t_production_order', 'color', 'VARCHAR(50) COMMENT "颜色"');
CALL SafeAddColumn('t_production_order', 'size', 'VARCHAR(50) COMMENT "码数"');
CALL SafeAddColumn('t_production_order', 'order_details', 'LONGTEXT COMMENT "订单明细JSON"');
CALL SafeAddColumn('t_production_order', 'progress_workflow_json', 'LONGTEXT COMMENT "进度节点定义JSON"');
CALL SafeAddColumn('t_production_order', 'progress_workflow_locked', 'INT NOT NULL DEFAULT 0 COMMENT "进度节点是否锁定"');
CALL SafeAddColumn('t_production_order', 'progress_workflow_locked_at', 'DATETIME COMMENT "进度节点锁定时间"');
CALL SafeAddColumn('t_production_order', 'progress_workflow_locked_by', 'VARCHAR(36) COMMENT "进度节点锁定人ID"');
CALL SafeAddColumn('t_production_order', 'progress_workflow_locked_by_name', 'VARCHAR(50) COMMENT "进度节点锁定人"');
CALL SafeAddColumn('t_production_order', 'remarks', 'VARCHAR(500) COMMENT "备注"');
CALL SafeAddColumn('t_production_order', 'expected_ship_date', 'DATE COMMENT "预计出货日期"');
CALL SafeAddColumn('t_production_order', 'node_operations', 'JSON COMMENT "节点操作记录"');
CALL SafeAddColumn('t_production_order', 'created_by_id', 'VARCHAR(50) COMMENT "创建人ID"');
CALL SafeAddColumn('t_production_order', 'created_by_name', 'VARCHAR(100) COMMENT "创建人姓名"');
CALL SafeAddColumn('t_production_order', 'version', 'INT DEFAULT 0 COMMENT "乐观锁版本"');
CALL SafeAddColumn('t_production_order', 'tenant_id', 'BIGINT COMMENT "租户ID"');
CALL SafeAddColumn('t_production_order', 'factory_contact_person', 'VARCHAR(50) COMMENT "工厂联系人"');
CALL SafeAddColumn('t_production_order', 'factory_contact_phone', 'VARCHAR(20) COMMENT "工厂联系电话"');
CALL SafeAddColumn('t_production_order', 'plate_type', 'VARCHAR(20) NOT NULL DEFAULT "FIRST" COMMENT "订单类型"');
CALL SafeAddColumn('t_production_order', 'order_biz_type', 'VARCHAR(32) COMMENT "订单业务类型"');
CALL SafeAddColumn('t_production_order', 'skc', 'VARCHAR(64) COMMENT "SKC号"');
CALL SafeAddColumn('t_production_order', 'notify_time_start', 'VARCHAR(10) COMMENT "通知开始时间"');
CALL SafeAddColumn('t_production_order', 'notify_time_end', 'VARCHAR(10) COMMENT "通知结束时间"');
CALL SafeAddColumn('t_production_order', 'customer_id', 'VARCHAR(36) COMMENT "CRM客户ID"');
CALL SafeAddColumn('t_production_order', 'factory_unit_price', 'DECIMAL(10,2) COMMENT "下单锁定单价"');
CALL SafeAddColumn('t_production_order', 'pricing_mode', 'VARCHAR(20) COMMENT "下单单价模式"');
CALL SafeAddColumn('t_production_order', 'scatter_pricing_mode', 'VARCHAR(20) COMMENT "散剪单价模式"');
CALL SafeAddColumn('t_production_order', 'scatter_cutting_unit_price', 'DECIMAL(10,2) COMMENT "散剪单价快照"');

-- 4. 补充 t_scan_record 缺失的列
CALL SafeAddColumn('t_scan_record', 'scan_ip', 'VARCHAR(20)');
CALL SafeAddColumn('t_scan_record', 'cutting_bundle_id', 'VARCHAR(36)');
CALL SafeAddColumn('t_scan_record', 'cutting_bundle_no', 'INT');
CALL SafeAddColumn('t_scan_record', 'cutting_bundle_qr_code', 'VARCHAR(200)');
CALL SafeAddColumn('t_scan_record', 'bundle_no', 'VARCHAR(100)');
CALL SafeAddColumn('t_scan_record', 'process_unit_price', 'DECIMAL(10,2)');
CALL SafeAddColumn('t_scan_record', 'scan_cost', 'DECIMAL(15,2)');
CALL SafeAddColumn('t_scan_record', 'delegate_target_type', 'VARCHAR(20)');
CALL SafeAddColumn('t_scan_record', 'delegate_target_id', 'VARCHAR(64)');
CALL SafeAddColumn('t_scan_record', 'delegate_target_name', 'VARCHAR(100)');
CALL SafeAddColumn('t_scan_record', 'actual_operator_id', 'VARCHAR(64)');
CALL SafeAddColumn('t_scan_record', 'actual_operator_name', 'VARCHAR(100)');
CALL SafeAddColumn('t_scan_record', 'receive_time', 'DATETIME');
CALL SafeAddColumn('t_scan_record', 'confirm_time', 'DATETIME');
CALL SafeAddColumn('t_scan_record', 'factory_id', 'VARCHAR(36)');
CALL SafeAddColumn('t_scan_record', 'current_progress_stage', 'VARCHAR(64)');
CALL SafeAddColumn('t_scan_record', 'progress_node_unit_prices', 'TEXT');
CALL SafeAddColumn('t_scan_record', 'cumulative_scan_count', 'INT');
CALL SafeAddColumn('t_scan_record', 'total_scan_count', 'INT');
CALL SafeAddColumn('t_scan_record', 'progress_percentage', 'DECIMAL(5,2)');
CALL SafeAddColumn('t_scan_record', 'total_piece_cost', 'DECIMAL(12,2)');
CALL SafeAddColumn('t_scan_record', 'average_piece_cost', 'DECIMAL(12,2)');
CALL SafeAddColumn('t_scan_record', 'assignment_id', 'BIGINT');
CALL SafeAddColumn('t_scan_record', 'assigned_operator_name', 'VARCHAR(64)');

-- 5. 补充 t_tenant 缺失的列
CALL SafeAddColumn('t_tenant', 'enabled_modules', 'TEXT COMMENT "启用的模块"');
CALL SafeAddColumn('t_tenant', 'source_biz_type', 'VARCHAR(50) COMMENT "来源业务类型"');

-- 清理存储过程
DROP PROCEDURE IF EXISTS SafeAddColumn;

-- 验证
SELECT 'Sync completed successfully!' as result;
