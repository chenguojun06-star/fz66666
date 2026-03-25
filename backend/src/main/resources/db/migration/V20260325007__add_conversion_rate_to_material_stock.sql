-- 为库存表增加几米一公斤参考值

SET @s1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_material_stock'
                AND COLUMN_NAME = 'conversion_rate') = 0,
    'ALTER TABLE `t_material_stock` ADD COLUMN `conversion_rate` DECIMAL(10,4) DEFAULT NULL COMMENT ''换算值：几米一公斤（参考值）'' AFTER `unit_price`',
    'SELECT 1');
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;
