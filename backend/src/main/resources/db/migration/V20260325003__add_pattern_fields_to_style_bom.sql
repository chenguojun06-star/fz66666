-- 为 BOM 增加纸样原始用量、拉链规格与单位换算字段

SET @a1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_bom'
                AND COLUMN_NAME = 'pattern_size_usage_map') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `pattern_size_usage_map` TEXT DEFAULT NULL COMMENT ''纸样录入各码用量(JSON，原始单位)'' AFTER `size_usage_map`',
    'SELECT 1');
PREPARE stmt1 FROM @a1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @a2 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_bom'
                AND COLUMN_NAME = 'size_spec_map') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `size_spec_map` TEXT DEFAULT NULL COMMENT ''各码规格尺寸(JSON，常用于拉链长度cm)'' AFTER `pattern_size_usage_map`',
    'SELECT 1');
PREPARE stmt2 FROM @a2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @a3 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_bom'
                AND COLUMN_NAME = 'pattern_unit') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `pattern_unit` VARCHAR(20) DEFAULT NULL COMMENT ''纸样录入单位'' AFTER `unit`',
    'SELECT 1');
PREPARE stmt3 FROM @a3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @a4 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 't_style_bom'
                AND COLUMN_NAME = 'conversion_rate') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `conversion_rate` DECIMAL(10,4) DEFAULT NULL COMMENT ''换算系数：1个纸样录入单位=x个BOM单位'' AFTER `pattern_unit`',
    'SELECT 1');
PREPARE stmt4 FROM @a4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;
