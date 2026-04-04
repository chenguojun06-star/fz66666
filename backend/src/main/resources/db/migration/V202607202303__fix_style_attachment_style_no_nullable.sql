-- Fix: t_style_attachment.style_no was manually added to cloud DB as NOT NULL WITHOUT DEFAULT.
-- This blocks all INSERT to t_style_attachment because MyBatis-Plus omits unset fields,
-- causing "Field 'style_no' doesn't have a default value" → HTTP 400 on attachment upload.
-- MODIFY to DEFAULT NULL so MyBatis-Plus INSERTs that omit style_no succeed.
-- Safe on fresh environments: if style_no does not exist, SELECT 1 is executed (no-op).
-- Fresh environments will get style_no added as DEFAULT NULL by DbColumnRepairRunner.

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_style_attachment'
      AND COLUMN_NAME  = 'style_no');
SET @s = IF(@col_exists > 0,
    'ALTER TABLE `t_style_attachment` MODIFY COLUMN `style_no` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
