-- 为BOM清单添加克重字段
-- 克重：从面辅料资料带入

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'fabric_weight') = 0,
  'ALTER TABLE `t_style_bom` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT ''克重''',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
