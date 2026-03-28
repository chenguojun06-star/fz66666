-- ============================================================
-- 云端数据库完整同步脚本
-- 版本: 2026-03-28
-- 功能: 同步所有缺失的表和列
-- 执行方式: 全部复制到云端数据库查询窗口一次性执行
-- ============================================================

-- 1. 创建缺失的intelligence相关表
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

-- 2. 补充 t_production_order 缺失的列
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS qr_code VARCHAR(100) COMMENT '订单二维码内容';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS color VARCHAR(50) COMMENT '颜色';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS size VARCHAR(50) COMMENT '码数';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS order_details LONGTEXT COMMENT '订单明细JSON';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS progress_workflow_json LONGTEXT COMMENT '进度节点定义JSON';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS progress_workflow_locked INT NOT NULL DEFAULT 0 COMMENT '进度节点是否锁定';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS progress_workflow_locked_at DATETIME COMMENT '进度节点锁定时间';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS progress_workflow_locked_by VARCHAR(36) COMMENT '进度节点锁定人ID';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS progress_workflow_locked_by_name VARCHAR(50) COMMENT '进度节点锁定人';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS remarks VARCHAR(500) COMMENT '备注';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS expected_ship_date DATE COMMENT '预计出货日期';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS node_operations JSON COMMENT '节点操作记录';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS created_by_id VARCHAR(50) COMMENT '创建人ID';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(100) COMMENT '创建人姓名';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS version INT DEFAULT 0 COMMENT '乐观锁版本';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS tenant_id BIGINT COMMENT '租户ID';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS factory_contact_person VARCHAR(50) COMMENT '工厂联系人';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS factory_contact_phone VARCHAR(20) COMMENT '工厂联系电话';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS plate_type VARCHAR(20) NOT NULL DEFAULT 'FIRST' COMMENT '订单类型';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS order_biz_type VARCHAR(32) COMMENT '订单业务类型';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS skc VARCHAR(64) COMMENT 'SKC号';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS notify_time_start VARCHAR(10) COMMENT '通知开始时间';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS notify_time_end VARCHAR(10) COMMENT '通知结束时间';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) COMMENT 'CRM客户ID';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS factory_unit_price DECIMAL(10,2) COMMENT '下单锁定单价';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) COMMENT '下单单价模式';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS scatter_pricing_mode VARCHAR(20) COMMENT '散剪单价模式';
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS scatter_cutting_unit_price DECIMAL(10,2) COMMENT '散剪单价快照';

-- 3. 补充 t_scan_record 缺失的列
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS scan_ip VARCHAR(20);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS cutting_bundle_id VARCHAR(36);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS cutting_bundle_no INT;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS cutting_bundle_qr_code VARCHAR(200);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS bundle_no VARCHAR(100);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS process_unit_price DECIMAL(10,2);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS scan_cost DECIMAL(15,2);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS delegate_target_type VARCHAR(20);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS delegate_target_id VARCHAR(64);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS delegate_target_name VARCHAR(100);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS actual_operator_id VARCHAR(64);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS actual_operator_name VARCHAR(100);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS receive_time DATETIME;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS confirm_time DATETIME;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS factory_id VARCHAR(36);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS current_progress_stage VARCHAR(64);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS progress_node_unit_prices TEXT;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS cumulative_scan_count INT;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS total_scan_count INT;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS progress_percentage DECIMAL(5,2);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS total_piece_cost DECIMAL(12,2);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS average_piece_cost DECIMAL(12,2);
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS assignment_id BIGINT;
ALTER TABLE t_scan_record ADD COLUMN IF NOT EXISTS assigned_operator_name VARCHAR(64);

-- 4. 补充 t_tenant 缺失的列
ALTER TABLE t_tenant ADD COLUMN IF NOT EXISTS enabled_modules TEXT COMMENT '启用的模块';
ALTER TABLE t_tenant ADD COLUMN IF NOT EXISTS source_biz_type VARCHAR(50) COMMENT '来源业务类型';

-- 验证
SELECT 'Sync completed!' as result;
