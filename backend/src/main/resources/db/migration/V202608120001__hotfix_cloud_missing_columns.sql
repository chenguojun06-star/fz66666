-- =====================================================================
-- Flyway 迁移：云端数据库补字段（幂等，可重复执行）
-- 日期：2026-08-12
-- 背景：云端 Flyway 迁移未完整执行，导致多个字段缺失
--   1. P1: t_scan_record 缺 process_unit_price → 工资单SQL报错
--   2. P2: t_ai_conversation_memory 缺 memory_summary → AI记忆归档报错
--   3. 预防性补齐其他可能缺失的字段
-- 注意：Flyway 不支持 DELIMITER，用动态 SQL + INFORMATION_SCHEMA 检查实现幂等
-- =====================================================================

-- ---------------------------------------------------------------------
-- 【P1 最急】t_scan_record 补字段
-- 修复：ScanRecordMapper.selectPayrollAggregation SQL 报错
-- ---------------------------------------------------------------------

-- process_unit_price
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'process_unit_price');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN process_unit_price DECIMAL(15,2) DEFAULT NULL COMMENT ''工序单价''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scan_cost
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'scan_cost');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN scan_cost DECIMAL(15,2) DEFAULT NULL COMMENT ''扫码工序成本''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scan_mode
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'scan_mode');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN scan_mode VARCHAR(20) DEFAULT ''BUNDLE'' COMMENT ''扫码模式: ORDER/BUNDLE/SKU''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sku_completed_count
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'sku_completed_count');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN sku_completed_count INT DEFAULT 0 COMMENT ''SKU完成数''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sku_total_count
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'sku_total_count');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN sku_total_count INT DEFAULT 0 COMMENT ''SKU总数''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- actual_operator_id
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'actual_operator_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN actual_operator_id VARCHAR(64) DEFAULT NULL COMMENT ''实际操作员ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- actual_operator_name
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'actual_operator_name');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN actual_operator_name VARCHAR(100) DEFAULT NULL COMMENT ''实际操作员名称''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payroll_settlement_id
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'payroll_settlement_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN payroll_settlement_id VARCHAR(64) DEFAULT NULL COMMENT ''工资结算单ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settlement_status
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'settlement_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN settlement_status VARCHAR(32) DEFAULT NULL COMMENT ''结算状态''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- confirm_time
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'confirm_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN confirm_time DATETIME DEFAULT NULL COMMENT ''确认时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cutting_bundle_no
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'cutting_bundle_no');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_no VARCHAR(64) DEFAULT NULL COMMENT ''扎号''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- total_amount
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'total_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN total_amount DECIMAL(15,2) DEFAULT NULL COMMENT ''总金额''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 【P2】t_ai_conversation_memory 补字段
-- 修复：AiConversationMemoryMapper.findArchivableBatchDegraded 报 "Unknown column memory_summary"
-- ---------------------------------------------------------------------

-- 先检查表是否存在，不存在则建表
SET @tbl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory');
SET @sql = IF(@tbl_exists = 0,
  'CREATE TABLE t_ai_conversation_memory (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, user_id VARCHAR(64) NOT NULL, memory_summary TEXT NOT NULL COMMENT ''记忆摘要'', key_entities TEXT NULL COMMENT ''关注的订单号/款式/工厂 JSON'', importance_score INT NOT NULL DEFAULT 50 COMMENT ''重要性分数'', source_message_count INT NOT NULL DEFAULT 0 COMMENT ''来源消息数'', create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expire_time DATETIME NULL COMMENT ''过期时间'', delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT ''删除标记'', INDEX idx_tenant_user (tenant_id, user_id), INDEX idx_create_time (create_time)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''AI对话记忆-用户级跨会话持久化''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- memory_summary
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'memory_summary');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN memory_summary TEXT NOT NULL COMMENT ''记忆摘要''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- key_entities
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'key_entities');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN key_entities TEXT NULL COMMENT ''关注的订单号/款式/工厂 JSON''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- importance_score
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'importance_score');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN importance_score INT NOT NULL DEFAULT 50 COMMENT ''重要性分数''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- source_message_count
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'source_message_count');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN source_message_count INT NOT NULL DEFAULT 0 COMMENT ''来源消息数''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- expire_time
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'expire_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN expire_time DATETIME NULL COMMENT ''过期时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- delete_flag
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_conversation_memory' AND COLUMN_NAME = 'delete_flag');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_ai_conversation_memory ADD COLUMN delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT ''删除标记''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 【预防性补齐】t_pattern_scan_record
-- ---------------------------------------------------------------------

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_pattern_scan_record' AND COLUMN_NAME = 'process_unit_price');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_pattern_scan_record ADD COLUMN process_unit_price DECIMAL(10,4) DEFAULT NULL COMMENT ''工序单价''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_pattern_scan_record' AND COLUMN_NAME = 'total_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_pattern_scan_record ADD COLUMN total_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''总金额''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 【预防性补齐】t_style_info
-- ---------------------------------------------------------------------

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pushed_to_order');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_style_info ADD COLUMN pushed_to_order TINYINT DEFAULT 0 COMMENT ''是否已推送到下单管理''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pushed_to_order_time');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_style_info ADD COLUMN pushed_to_order_time DATETIME DEFAULT NULL COMMENT ''推送时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pushed_by_name');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_style_info ADD COLUMN pushed_by_name VARCHAR(100) DEFAULT NULL COMMENT ''推送人''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'progress_node');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_style_info ADD COLUMN progress_node VARCHAR(64) DEFAULT NULL COMMENT ''进度节点''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'order_type');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_style_info ADD COLUMN order_type VARCHAR(64) DEFAULT NULL COMMENT ''订单类型''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
