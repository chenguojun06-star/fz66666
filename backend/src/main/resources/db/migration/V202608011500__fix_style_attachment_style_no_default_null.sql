-- Fix: t_style_attachment.style_no must be nullable.
-- StyleAttachment entity has NO styleNo field; MyBatis-Plus INSERT-Inline never includes style_no.
-- Cloud DB has style_no as NOT NULL WITHOUT DEFAULT (previously V202607202303 took the SELECT 1
-- no-op path because the column did not exist when that migration ran, then was added as NOT NULL).
-- This migration handles BOTH cases:
--   - Column EXISTS as NOT NULL -> MODIFY to DEFAULT NULL
--   - Column DOES NOT EXIST -> ADD as DEFAULT NULL
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_attachment' AND COLUMN_NAME = 'style_no') > 0,
    'ALTER TABLE `t_style_attachment` MODIFY COLUMN `style_no` VARCHAR(64) DEFAULT NULL',
    'ALTER TABLE `t_style_attachment` ADD COLUMN `style_no` VARCHAR(64) DEFAULT NULL');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
