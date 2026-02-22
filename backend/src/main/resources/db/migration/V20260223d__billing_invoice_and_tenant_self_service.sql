-- ============================================================
-- V20260223d: 账单发票字段 + 租户开票信息
-- 1. t_tenant_billing_record 增加发票相关字段
-- 2. t_tenant 增加默认开票信息（租户自助维护）
-- ============================================================

-- 1. 账单增加发票字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_required');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_required TINYINT DEFAULT 0 COMMENT ''是否需要发票'' AFTER remark');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_status');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_status VARCHAR(20) DEFAULT ''NOT_REQUIRED'' COMMENT ''发票状态: NOT_REQUIRED/PENDING/ISSUED/MAILED'' AFTER invoice_required');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''发票抬头'' AFTER invoice_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_no VARCHAR(50) DEFAULT NULL COMMENT ''发票号码'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_amount');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''发票金额'' AFTER invoice_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_issued_time');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_issued_time DATETIME DEFAULT NULL COMMENT ''开票时间'' AFTER invoice_amount');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_issued_time');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_tenant 增加默认开票信息（租户可自助维护，生成账单时自动填充）
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''默认发票抬头'' AFTER contact_phone');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''默认纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
