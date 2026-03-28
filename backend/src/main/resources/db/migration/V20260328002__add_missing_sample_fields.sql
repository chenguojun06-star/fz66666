-- Idempotent migration: add missing sample_* fields to t_style_info
-- These fields are referenced in Entity but were never created in the database
-- V20260312003 uses these columns, so their absence causes SQL errors

-- 样衣状态字段补充
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 't_style_info' 
    AND COLUMN_NAME = 'sample_status') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_status` VARCHAR(50) DEFAULT NULL COMMENT "样衣状态: DRAFT/IN_PROGRESS/COMPLETED"',
    'SELECT 1');
PREPARE stmt1 FROM @s;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 样衣进度字段补充
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 't_style_info' 
    AND COLUMN_NAME = 'sample_progress') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_progress` INT DEFAULT 0 COMMENT "样衣进度百分比: 0-100"',
    'SELECT 1');
PREPARE stmt2 FROM @s;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 样衣完成时间字段补充
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 't_style_info' 
    AND COLUMN_NAME = 'sample_completed_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_completed_time` DATETIME DEFAULT NULL COMMENT "样衣完成时间"',
    'SELECT 1');
PREPARE stmt3 FROM @s;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
