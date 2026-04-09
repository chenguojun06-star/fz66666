-- Fix: t_pattern_scan_record.operator_role column was missing from DB despite being mapped in Java entity
-- This caused INSERT failures ("Unknown column 'operator_role'") on all pattern scan operations
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_pattern_scan_record'
       AND COLUMN_NAME  = 'operator_role') = 0,
    'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `operator_role` VARCHAR(50) NULL AFTER `operator_name`',
    'SELECT 1'
);
PREPARE __st FROM @s; EXECUTE __st; DEALLOCATE PREPARE __st;
