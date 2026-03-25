-- 为采购单增加公斤参考换算值（几米一公斤）

SET @m1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_material_purchase'
                AND COLUMN_NAME = 'conversion_rate') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `conversion_rate` DECIMAL(10,4) DEFAULT NULL COMMENT ''换算值：几米一公斤（参考值）'' AFTER `purchase_quantity`',
    'SELECT 1');
PREPARE stmt1 FROM @m1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;
