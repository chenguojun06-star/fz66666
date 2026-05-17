SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_outbound_log' AND COLUMN_NAME = 'warehouse_area_id'),
    'ALTER TABLE t_material_outbound_log ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL AFTER warehouse_location',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_outbound_log' AND COLUMN_NAME = 'warehouse_area_name'),
    'ALTER TABLE t_material_outbound_log ADD COLUMN warehouse_area_name VARCHAR(128) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sample_loan' AND COLUMN_NAME = 'warehouse_area_id'),
    'ALTER TABLE t_sample_loan ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL AFTER remark',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sample_loan' AND COLUMN_NAME = 'warehouse_area_name'),
    'ALTER TABLE t_sample_loan ADD COLUMN warehouse_area_name VARCHAR(128) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
