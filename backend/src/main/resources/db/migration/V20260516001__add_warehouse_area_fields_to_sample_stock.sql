SET @s = IF(NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sample_stock' AND COLUMN_NAME = 'warehouse_area_id'
), 'ALTER TABLE t_sample_stock ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL AFTER location', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sample_stock' AND COLUMN_NAME = 'warehouse_area_name'
), 'ALTER TABLE t_sample_stock ADD COLUMN warehouse_area_name VARCHAR(128) DEFAULT NULL AFTER warehouse_area_id', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
