-- V20260513004: 工资结算部分付款字段 + 员工借支表 + 自有工厂次品扣款支持

-- 1. t_payroll_settlement 增加部分付款字段
SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='paid_amount'),
  'ALTER TABLE t_payroll_settlement ADD COLUMN paid_amount DECIMAL(12,2) DEFAULT 0.00',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='remaining_amount'),
  'ALTER TABLE t_payroll_settlement ADD COLUMN remaining_amount DECIMAL(12,2) DEFAULT 0.00',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='deduction_amount'),
  'ALTER TABLE t_payroll_settlement ADD COLUMN deduction_amount DECIMAL(12,2) DEFAULT 0.00',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='advance_amount'),
  'ALTER TABLE t_payroll_settlement ADD COLUMN advance_amount DECIMAL(12,2) DEFAULT 0.00',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='payment_status'),
  'ALTER TABLE t_payroll_settlement ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_payroll_settlement SET paid_amount = 0, remaining_amount = COALESCE(total_amount, 0), deduction_amount = 0, advance_amount = 0 WHERE remaining_amount IS NULL;

-- 2. t_deduction_item 增加 settlement_id 字段（支持工资结算扣款）
SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_deduction_item' AND COLUMN_NAME='settlement_id'),
  'ALTER TABLE t_deduction_item ADD COLUMN settlement_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 创建员工借支表
CREATE TABLE IF NOT EXISTS t_employee_advance (
  id VARCHAR(64) NOT NULL,
  advance_no VARCHAR(64) DEFAULT NULL,
  employee_id VARCHAR(64) DEFAULT NULL,
  employee_name VARCHAR(100) DEFAULT NULL,
  factory_id VARCHAR(64) DEFAULT NULL,
  factory_name VARCHAR(100) DEFAULT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  status VARCHAR(20) DEFAULT NULL,
  order_no VARCHAR(64) DEFAULT NULL,
  approver_id VARCHAR(64) DEFAULT NULL,
  approver_name VARCHAR(100) DEFAULT NULL,
  approval_time DATETIME DEFAULT NULL,
  approval_remark VARCHAR(500) DEFAULT NULL,
  repayment_amount DECIMAL(12,2) DEFAULT 0.00,
  remaining_amount DECIMAL(12,2) DEFAULT 0.00,
  repayment_status VARCHAR(20) DEFAULT NULL,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT NULL,
  update_by VARCHAR(64) DEFAULT NULL,
  delete_flag INT DEFAULT 0,
  tenant_id BIGINT DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_advance_no (advance_no),
  KEY idx_employee_id (employee_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
