-- 为尺寸表增加显式分组字段，支持套装场景按上装区/下装区/自定义分区保存

SET @s = IF((SELECT COUNT(*)
               FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_size'
                AND COLUMN_NAME = 'group_name') = 0,
    'ALTER TABLE `t_style_size` ADD COLUMN `group_name` VARCHAR(50) DEFAULT NULL COMMENT ''尺寸分组名，如上装区/下装区'' AFTER `part_name`',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
