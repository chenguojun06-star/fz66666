-- 为尺寸表增加基准码和跳码规则字段

SET @s1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_size'
                AND COLUMN_NAME = 'base_size') = 0,
    'ALTER TABLE `t_style_size` ADD COLUMN `base_size` VARCHAR(50) DEFAULT NULL COMMENT ''基准码/样衣码'' AFTER `measure_method`',
    'SELECT 1');
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @s2 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_size'
                AND COLUMN_NAME = 'grading_rule') = 0,
    'ALTER TABLE `t_style_size` ADD COLUMN `grading_rule` TEXT DEFAULT NULL COMMENT ''跳码规则JSON'' AFTER `image_urls`',
    'SELECT 1');
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
