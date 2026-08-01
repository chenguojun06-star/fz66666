-- V202608201300: 补齐 t_pattern_scan_record 的 process_unit_price 和 total_amount 列
-- ScanRecordOrchestrator 引用了这两个字段但表结构缺失

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_pattern_scan_record' AND COLUMN_NAME = 'process_unit_price');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_pattern_scan_record ADD COLUMN process_unit_price DECIMAL(10,4) DEFAULT NULL COMMENT ''工序单价''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_pattern_scan_record' AND COLUMN_NAME = 'total_amount');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_pattern_scan_record ADD COLUMN total_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''总金额''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
