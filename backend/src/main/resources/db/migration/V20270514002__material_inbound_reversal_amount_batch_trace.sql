SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='source_type'),
  'ALTER TABLE t_material_inbound ADD COLUMN source_type VARCHAR(40) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='quantity'),
  'ALTER TABLE t_material_inbound ADD COLUMN quantity INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='unit_price'),
  'ALTER TABLE t_material_inbound ADD COLUMN unit_price DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='total_amount'),
  'ALTER TABLE t_material_inbound ADD COLUMN total_amount DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='payment_status'),
  'ALTER TABLE t_material_inbound ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='paid_amount'),
  'ALTER TABLE t_material_inbound ADD COLUMN paid_amount DECIMAL(12,2) DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_material_inbound SET payment_status = 'unpaid' WHERE payment_status IS NULL;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='purchase_order_id'),
  'ALTER TABLE t_material_inbound ADD COLUMN purchase_order_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='batch_no'),
  'ALTER TABLE t_material_inbound ADD COLUMN batch_no VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='trace_id'),
  'ALTER TABLE t_material_inbound ADD COLUMN trace_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='reversal_id'),
  'ALTER TABLE t_material_inbound ADD COLUMN reversal_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='reversed_by_id'),
  'ALTER TABLE t_material_inbound ADD COLUMN reversed_by_id VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='reversal_status'),
  'ALTER TABLE t_material_inbound ADD COLUMN reversal_status VARCHAR(20) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='reversal_reason'),
  'ALTER TABLE t_material_inbound ADD COLUMN reversal_reason VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_material_inbound SET reversal_status = 'NONE' WHERE reversal_status IS NULL;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND INDEX_NAME='idx_mi_trace_id');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_material_inbound ADD INDEX idx_mi_trace_id (trace_id)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND INDEX_NAME='idx_mi_batch_no');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_material_inbound ADD INDEX idx_mi_batch_no (batch_no)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND INDEX_NAME='idx_mi_reversal_status');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_material_inbound ADD INDEX idx_mi_reversal_status (reversal_status)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_inbound' AND INDEX_NAME='idx_mi_payment_status');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_material_inbound ADD INDEX idx_mi_payment_status (payment_status)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
