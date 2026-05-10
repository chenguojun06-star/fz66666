SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_process_tracking' AND COLUMN_NAME = 'defect_problems') = 0,
    'ALTER TABLE t_production_process_tracking ADD COLUMN defect_problems TEXT',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
