SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='reversal_id'),
  'ALTER TABLE t_product_warehousing ADD COLUMN reversal_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='reversed_by_id'),
  'ALTER TABLE t_product_warehousing ADD COLUMN reversed_by_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='reversal_status'),
  'ALTER TABLE t_product_warehousing ADD COLUMN reversal_status VARCHAR(20) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='reversal_reason'),
  'ALTER TABLE t_product_warehousing ADD COLUMN reversal_reason VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_product_warehousing SET reversal_status = 'NONE' WHERE reversal_status IS NULL;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='unit_price'),
  'ALTER TABLE t_product_warehousing ADD COLUMN unit_price DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='total_amount'),
  'ALTER TABLE t_product_warehousing ADD COLUMN total_amount DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='payment_status'),
  'ALTER TABLE t_product_warehousing ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='paid_amount'),
  'ALTER TABLE t_product_warehousing ADD COLUMN paid_amount DECIMAL(12,2) DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_product_warehousing SET payment_status = 'unpaid' WHERE payment_status IS NULL;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='batch_no'),
  'ALTER TABLE t_product_warehousing ADD COLUMN batch_no VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='trace_id'),
  'ALTER TABLE t_product_warehousing ADD COLUMN trace_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='qrcode'),
  'ALTER TABLE t_product_warehousing ADD COLUMN qrcode VARCHAR(256) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='edit_history'),
  'ALTER TABLE t_product_warehousing ADD COLUMN edit_history TEXT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='supplier_id'),
  'ALTER TABLE t_product_warehousing ADD COLUMN supplier_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_reversal_status');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_product_warehousing ADD INDEX idx_pw_reversal_status (reversal_status)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_trace_id');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_product_warehousing ADD INDEX idx_pw_trace_id (trace_id)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_batch_no');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_product_warehousing ADD INDEX idx_pw_batch_no (batch_no)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_payment_status');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_product_warehousing ADD INDEX idx_pw_payment_status (payment_status)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stock_change_log' AND COLUMN_NAME='unit_price'),
  'ALTER TABLE t_stock_change_log ADD COLUMN unit_price DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stock_change_log' AND COLUMN_NAME='total_amount'),
  'ALTER TABLE t_stock_change_log ADD COLUMN total_amount DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stock_change_log' AND COLUMN_NAME='trace_id'),
  'ALTER TABLE t_stock_change_log ADD COLUMN trace_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stock_change_log' AND INDEX_NAME='idx_scl_trace_id');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_stock_change_log ADD INDEX idx_scl_trace_id (trace_id)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
