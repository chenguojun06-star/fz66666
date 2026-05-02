SET @dbname = DATABASE();
SET @tablename = 't_scan_precheck_feedback';

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'scan_type');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN scan_type VARCHAR(32) DEFAULT NULL AFTER order_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'precheck_issues');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN precheck_issues JSON DEFAULT NULL AFTER scan_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'user_remark');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN user_remark VARCHAR(512) DEFAULT NULL AFTER user_action', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'operator_id');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN operator_id BIGINT DEFAULT NULL AFTER user_remark', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'operator_name');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN operator_name VARCHAR(64) DEFAULT NULL AFTER operator_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'scan_record_id');
SET @s = IF(@col_exists > 0, 'ALTER TABLE t_scan_precheck_feedback DROP COLUMN scan_record_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'precheck_result');
SET @s = IF(@col_exists > 0, 'ALTER TABLE t_scan_precheck_feedback DROP COLUMN precheck_result', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = @tablename AND column_name = 'feedback_text');
SET @s = IF(@col_exists > 0, 'ALTER TABLE t_scan_precheck_feedback DROP COLUMN feedback_text', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE t_scan_precheck_feedback MODIFY COLUMN order_no VARCHAR(64) DEFAULT NULL;
ALTER TABLE t_scan_precheck_feedback MODIFY COLUMN user_action VARCHAR(16) NOT NULL;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = @dbname AND table_name = @tablename AND index_name = 'idx_spf_tenant_created');
SET @s = IF(@idx_exists = 0, 'ALTER TABLE t_scan_precheck_feedback ADD INDEX idx_spf_tenant_created (tenant_id, created_at)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
