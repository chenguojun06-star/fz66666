-- ============================================================
-- V202710130002: 补齐「Flyway 以为建了、生产库其实没有」的表与列
--
-- 背景（2026-10-13 线上实测）：
--   生产库 flyway_schema_history 里这些迁移全部 success=1，
--   但表在库里根本不存在：
--     V25     create logistics tables          → t_logistics_track 不存在
--     V31     create logistics ecommerce tables → t_express_order  不存在
--     V20260223 unit price audit…              → t_unit_price_audit_log 不存在
--     V202604301004 create ai operation audit  → t_ai_operation_audit 不存在
--     （t_material_roll 同理）
--   即：库在某次还原/重建时丢了这些表，而 Flyway 记录还在 —— 已 applied 的迁移
--   永远不会重跑，所以表再也回不来。
--
--   另一类是表在、列不全（CREATE TABLE IF NOT EXISTS 遇到旧结构直接跳过）：
--     t_goal_decomposition 缺 16 列、t_agent_memory_core 缺 3 列。
--
-- 影响（都是「一调用就 500」）：
--   /api/express-order/**（ExpressOrderController）
--   /api/production/material/roll/**（MaterialRollController）
--   智能巡检的物流轨迹（IntelligenceAdvancedController → LogisticsTrackingOrchestrator）
--   AI 操作审计（AiOperationAuditOrchestrator）
--   目标拆解（AutonomousAgentController）
--   智能体记忆（AgentMemoryService / MemoryBankService）
--
-- 写法：CREATE TABLE IF NOT EXISTS + information_schema 守卫的 ADD COLUMN，
--       重复执行与「结构已正确」的库都安全（沿用 V38 的写法）。
--
-- 列定义以**实体**为准：这三张表的主键是 String + IdType.ASSIGN_ID/ASSIGN_UUID，
-- 不是老迁移里的 BIGINT AUTO_INCREMENT（实体已改、迁移没跟，所以不能照抄老迁移）。
-- ============================================================

-- ── 1. AI 操作审计（定义与 V202604301004 一致，与 AiOperationAuditRecord 实体逐字段对齐）──
CREATE TABLE IF NOT EXISTS `t_ai_operation_audit` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `session_id` VARCHAR(64) COMMENT '会话ID',
    `tool_name` VARCHAR(64) NOT NULL COMMENT '工具/操作名',
    `risk_level` VARCHAR(16) DEFAULT 'low' COMMENT 'low|medium|high',
    `input_summary` TEXT COMMENT '输入摘要',
    `output_summary` TEXT COMMENT '输出摘要',
    `approval_status` VARCHAR(16) DEFAULT 'auto_approved' COMMENT 'auto_approved|pending|approved|rejected',
    `approved_by` VARCHAR(64),
    `approved_at` DATETIME,
    `execution_time_ms` INT DEFAULT 0,
    `success` TINYINT(1) DEFAULT 1,
    `error_message` VARCHAR(512),
    `operator_id` BIGINT,
    `operator_name` VARCHAR(64),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_aoa_tenant_created` (`tenant_id`, `created_at`),
    KEY `idx_aoa_tenant_tool` (`tenant_id`, `tool_name`),
    KEY `idx_aoa_tenant_risk` (`tenant_id`, `risk_level`),
    KEY `idx_aoa_approval_status` (`approval_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 操作审计';

-- ── 2. 快递单（ExpressOrder 实体：String 主键 + tenant_id）──
CREATE TABLE IF NOT EXISTS `t_express_order` (
    `id` VARCHAR(64) NOT NULL COMMENT '主键（ASSIGN_UUID）',
    `tracking_no` VARCHAR(100) NOT NULL COMMENT '快递单号',
    `tracking_no_sub` VARCHAR(100) COMMENT '子单号',
    `express_company` INT COMMENT '快递公司',
    `shipment_type` INT DEFAULT 1 COMMENT '发货类型',
    `logistics_status` INT DEFAULT 0 COMMENT '物流状态',
    `order_id` VARCHAR(64),
    `order_no` VARCHAR(100),
    `style_id` VARCHAR(64),
    `style_no` VARCHAR(64),
    `style_name` VARCHAR(200),
    `shipment_quantity` INT DEFAULT 0,
    `weight` DECIMAL(10,2),
    `freight_amount` DECIMAL(10,2) COMMENT '运费',
    `freight_pay_type` INT COMMENT '运费付款方式',
    `shipper_id` VARCHAR(64),
    `shipper_name` VARCHAR(100),
    `ship_time` DATETIME,
    `receiver_name` VARCHAR(100),
    `receiver_phone` VARCHAR(50),
    `receiver_address` VARCHAR(500),
    `receiver_province` VARCHAR(50),
    `receiver_city` VARCHAR(50),
    `receiver_district` VARCHAR(50),
    `estimated_arrival_time` DATETIME,
    `actual_sign_time` DATETIME,
    `sign_person` VARCHAR(100),
    `track_update_time` DATETIME,
    `track_data` TEXT COMMENT '轨迹原始数据',
    `platform_order_no` VARCHAR(100),
    `platform_code` VARCHAR(50),
    `delete_flag` INT DEFAULT 0,
    `tenant_id` BIGINT NOT NULL DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_eo_tenant_status` (`tenant_id`, `logistics_status`),
    KEY `idx_eo_tracking_no` (`tracking_no`),
    KEY `idx_eo_tenant_order` (`tenant_id`, `order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递单';

-- ── 3. 面料卷（MaterialRoll 实体：String 主键）──
CREATE TABLE IF NOT EXISTS `t_material_roll` (
    `id` VARCHAR(64) NOT NULL COMMENT '主键（ASSIGN_ID）',
    `roll_code` VARCHAR(64) COMMENT '卷号',
    `inbound_id` VARCHAR(64),
    `inbound_no` VARCHAR(64),
    `material_code` VARCHAR(64),
    `material_name` VARCHAR(200),
    `material_type` VARCHAR(50),
    `color` VARCHAR(50),
    `specifications` VARCHAR(200) COMMENT '规格',
    `unit` VARCHAR(20),
    `quantity` DECIMAL(15,2),
    `warehouse_location` VARCHAR(100),
    `status` VARCHAR(20) DEFAULT 'IN_STOCK',
    `issued_order_id` VARCHAR(64),
    `issued_order_no` VARCHAR(64),
    `issued_time` DATETIME,
    `issued_by_id` VARCHAR(64),
    `issued_by_name` VARCHAR(100),
    `supplier_name` VARCHAR(200),
    `remark` VARCHAR(500),
    `tenant_id` BIGINT NOT NULL DEFAULT 0,
    `creator_id` VARCHAR(64),
    `creator_name` VARCHAR(100),
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag` INT DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_mr_tenant_code` (`tenant_id`, `roll_code`),
    KEY `idx_mr_tenant_status` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面料卷';

-- ── 4. 物流轨迹（LogisticsTrack 实体：String 主键）──
CREATE TABLE IF NOT EXISTS `t_logistics_track` (
    `id` VARCHAR(64) NOT NULL COMMENT '主键（ASSIGN_UUID）',
    `tenant_id` BIGINT NOT NULL DEFAULT 0,
    `express_order_id` VARCHAR(64),
    `tracking_no` VARCHAR(100),
    `track_time` DATETIME,
    `track_desc` VARCHAR(500),
    `track_location` VARCHAR(200),
    `action_code` VARCHAR(50),
    `action_name` VARCHAR(100),
    `courier_name` VARCHAR(100),
    `courier_phone` VARCHAR(50),
    `signed` INT DEFAULT 0,
    `data_source` INT COMMENT '数据来源',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_lt_tenant_tracking` (`tenant_id`, `tracking_no`),
    KEY `idx_lt_express_order` (`express_order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流轨迹';

-- ── 5. 补列：t_goal_decomposition（缺 16 列）──
DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_not_exists$$

CREATE PROCEDURE add_column_if_not_exists(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition VARCHAR(500)
)
BEGIN
    DECLARE col_count INT;
    SELECT COUNT(*) INTO col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column;

    IF col_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

CALL add_column_if_not_exists('t_goal_decomposition', 'parent_goal_id',
    "BIGINT DEFAULT NULL COMMENT '父目标ID(NULL=顶层)'");
CALL add_column_if_not_exists('t_goal_decomposition', 'goal_type',
    "VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'business|production|quality|cost|delivery'");
CALL add_column_if_not_exists('t_goal_decomposition', 'title',
    "VARCHAR(200) NOT NULL DEFAULT '' COMMENT '目标标题'");
CALL add_column_if_not_exists('t_goal_decomposition', 'metric_name',
    "VARCHAR(100) COMMENT '衡量指标名'");
CALL add_column_if_not_exists('t_goal_decomposition', 'metric_current',
    "DECIMAL(10,2) COMMENT '当前指标值'");
CALL add_column_if_not_exists('t_goal_decomposition', 'metric_target',
    "DECIMAL(10,2) COMMENT '目标指标值'");
CALL add_column_if_not_exists('t_goal_decomposition', 'metric_unit',
    "VARCHAR(20) COMMENT '指标单位'");
CALL add_column_if_not_exists('t_goal_decomposition', 'priority',
    "VARCHAR(10) DEFAULT 'medium' COMMENT 'low|medium|high|critical'");
CALL add_column_if_not_exists('t_goal_decomposition', 'deadline',
    "DATETIME COMMENT '截止日期'");
CALL add_column_if_not_exists('t_goal_decomposition', 'progress',
    "INT DEFAULT 0 COMMENT '完成进度0-100'");
CALL add_column_if_not_exists('t_goal_decomposition', 'ai_source',
    "VARCHAR(50) COMMENT 'auto_discovered|user_defined|patrol_suggested'");
CALL add_column_if_not_exists('t_goal_decomposition', 'linked_pattern_id',
    "BIGINT COMMENT '关联模式发现ID'");
CALL add_column_if_not_exists('t_goal_decomposition', 'linked_rca_id',
    "BIGINT COMMENT '关联根因分析ID'");
CALL add_column_if_not_exists('t_goal_decomposition', 'completion_note',
    "VARCHAR(500) COMMENT '完成总结'");
CALL add_column_if_not_exists('t_goal_decomposition', 'delete_flag',
    "INT DEFAULT 0");
CALL add_column_if_not_exists('t_goal_decomposition', 'update_time',
    "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

-- ── 6. 补列：t_agent_memory_core（缺 3 列）──
-- 老结构里的 `key`/`value` 是 NOT NULL 且无默认值，而实体（以及 AgentMemoryService /
-- MemoryBankService 的 LambdaQueryWrapper）用的是 agent_id / memory_key / memory_value，
-- INSERT 根本不会带 key/value → 不放开就会报 "Column 'key' cannot be null"。
CALL add_column_if_not_exists('t_agent_memory_core', 'agent_id',
    "VARCHAR(64) COMMENT '智能体标识'");
CALL add_column_if_not_exists('t_agent_memory_core', 'memory_key',
    "VARCHAR(256) COMMENT '记忆键'");
CALL add_column_if_not_exists('t_agent_memory_core', 'memory_value',
    "TEXT COMMENT '记忆值'");

DROP PROCEDURE IF EXISTS add_column_if_not_exists;

-- 老列 key/value 放开为可空（保留数据、不删列：可能仍有历史行）
SET @nullable_key = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_agent_memory_core'
    AND COLUMN_NAME = 'key' AND IS_NULLABLE = 'NO'
);
SET @sql = IF(@nullable_key = 1,
  'ALTER TABLE `t_agent_memory_core` MODIFY COLUMN `key` VARCHAR(256) DEFAULT NULL COMMENT ''旧结构遗留列''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @nullable_value = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_agent_memory_core'
    AND COLUMN_NAME = 'value' AND IS_NULLABLE = 'NO'
);
SET @sql = IF(@nullable_value = 1,
  'ALTER TABLE `t_agent_memory_core` MODIFY COLUMN `value` TEXT DEFAULT NULL COMMENT ''旧结构遗留列''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证：这 4 张表都应存在
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('t_ai_operation_audit', 't_express_order', 't_material_roll', 't_logistics_track')
ORDER BY TABLE_NAME;
