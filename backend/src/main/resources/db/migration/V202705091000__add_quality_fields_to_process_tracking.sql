SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'quality_status') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN quality_status VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'defect_quantity') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN defect_quantity INT DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'defect_category') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN defect_category VARCHAR(50) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'defect_remark') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN defect_remark VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'quality_operator_id') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN quality_operator_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'quality_operator_name') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN quality_operator_name VARCHAR(50) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'quality_time') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN quality_time DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'repair_status') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN repair_status VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'repair_completed_time') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN repair_completed_time DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
