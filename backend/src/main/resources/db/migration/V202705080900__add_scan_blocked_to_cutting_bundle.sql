SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'scan_blocked') = 0,
    'ALTER TABLE t_cutting_bundle ADD COLUMN scan_blocked TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE t_cutting_bundle SET scan_blocked = 0 WHERE scan_blocked IS NULL;
