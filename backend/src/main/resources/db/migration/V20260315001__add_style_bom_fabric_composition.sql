-- 为 BOM 清单补充成分字段，支持从面辅料资料带入并在款式开发页展示

SET @s = IF((SELECT COUNT(*)
              FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_style_bom'
               AND COLUMN_NAME = 'fabric_composition') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `fabric_composition` VARCHAR(100) DEFAULT NULL COMMENT ''物料成分，优先从面辅料资料带入'' AFTER `material_name`',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
