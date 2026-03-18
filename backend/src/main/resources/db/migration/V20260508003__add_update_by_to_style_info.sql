-- 向 t_style_info 添加 update_by 列，用于记录最后维护人
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'update_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `update_by` VARCHAR(100) DEFAULT NULL COMMENT ''最后维护人'' AFTER `update_time`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
