-- =====================================================================
-- Flyway 迁移：修复工资单 SQL 跨表 JOIN 报错（缺列 + collation 冲突）
-- 日期：2026-08-16
-- 背景（P0 生产事故）：
--   关单自动生成工资单报错 ScanRecordMapper.selectPayrollAggregation
--   "The error occurred while setting parameters"（实为 ERROR 1267）
--   根因1（collation 冲突·主因）：t_production_process_tracking 为
--         utf8mb4_unicode_ci（init.sql 派少数），t_scan_record 及全部
--         业务关联表为 utf8mb4_0900_ai_ci（主流 215 张）。
--         JOIN pt.scan_record_id = sr.id 直接报 Illegal mix of collations。
--   根因2（缺列·次因）：tracking 表由 DbTableDefinitions 动态建，
--         早期模板无 scan_record_id 列；IF NOT EXISTS 跳过 + 补列清单
--         漏项 → 部分环境缺列。
--   修复：本表 CONVERT 对齐主流 0900_ai_ci（全库唯一 JOIN 伙伴即本 SQL，
--         且 production_order/cutting_bundle/payroll_settlement 全为 0900，
--         零风险）+ 幂等补列 + 回填 + 索引。可重复执行。
-- 注意：Flyway 不支持 DELIMITER，用动态 SQL + INFORMATION_SCHEMA 实现幂等
-- =====================================================================

-- ---------------------------------------------------------------------
-- 【根因1修复】collation 统一对齐主流 utf8mb4_0900_ai_ci
-- ---------------------------------------------------------------------

SET @coll_ok = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND TABLE_COLLATION = 'utf8mb4_0900_ai_ci');
SET @sql = IF(@coll_ok = 0,
  'ALTER TABLE t_production_process_tracking CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- t_production_process_tracking 补列（工资 SQL LEFT JOIN / GROUP 依赖）
-- ---------------------------------------------------------------------

-- scan_record_id 【P0 缺失直接导致本次事故】
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'scan_record_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN scan_record_id VARCHAR(64) DEFAULT NULL COMMENT ''关联扫码记录ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'tenant_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN tenant_id BIGINT DEFAULT NULL COMMENT ''租户ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- process_name
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'process_name');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN process_name VARCHAR(100) DEFAULT NULL COMMENT ''工序名称''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- quantity
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'quantity');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN quantity INT DEFAULT NULL COMMENT ''数量''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- unit_price
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'unit_price');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN unit_price DECIMAL(10,4) DEFAULT NULL COMMENT ''工序单价''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settlement_amount
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'settlement_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN settlement_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''结算金额''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_settled
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'is_settled');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN is_settled TINYINT(1) DEFAULT 0 COMMENT ''是否已结算''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settled_at
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'settled_at');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN settled_at DATETIME DEFAULT NULL COMMENT ''结算时间''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settled_batch_no
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'settled_batch_no');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN settled_batch_no VARCHAR(64) DEFAULT NULL COMMENT ''结算批次号''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settled_by
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'settled_by');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_production_process_tracking ADD COLUMN settled_by VARCHAR(64) DEFAULT NULL COMMENT ''结算人''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 索引：scan_record_id 关联查询（回填历史 + 加速 JOIN）
-- ---------------------------------------------------------------------

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND INDEX_NAME = 'idx_ppt_scan_record_id');
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_ppt_scan_record_id ON t_production_process_tracking (scan_record_id)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 回填：按 扫码时间+订单+菲号+工序 对齐 tracking.scan_record_id
-- 仅回填 NULL 行，幂等；对不上的保留 NULL（历史数据不强行关联）
-- ---------------------------------------------------------------------

UPDATE t_production_process_tracking pt
JOIN t_scan_record sr
  ON sr.tenant_id = pt.tenant_id
 AND sr.order_id = pt.production_order_id
 AND sr.cutting_bundle_no = pt.bundle_no
 AND sr.process_name = pt.process_name
SET pt.scan_record_id = sr.id
WHERE pt.scan_record_id IS NULL
  AND sr.scan_result = 'success'
  AND sr.quantity > 0
  AND sr.factory_id IS NULL
  AND sr.scan_type != 'orchestration';

-- ---------------------------------------------------------------------
-- t_scan_record 关键列兜底复核（工资 SQL 依赖，防其他环境同样缺失）
-- ---------------------------------------------------------------------

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'settlement_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN settlement_status VARCHAR(32) DEFAULT NULL COMMENT ''结算状态''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'payroll_settlement_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN payroll_settlement_id VARCHAR(64) DEFAULT NULL COMMENT ''工资结算单ID''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'process_unit_price');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN process_unit_price DECIMAL(15,2) DEFAULT NULL COMMENT ''工序单价''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'total_amount');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN total_amount DECIMAL(15,2) DEFAULT NULL COMMENT ''总金额''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_scan_record' AND COLUMN_NAME = 'scan_cost');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN scan_cost DECIMAL(15,2) DEFAULT NULL COMMENT ''扫码工序成本''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
