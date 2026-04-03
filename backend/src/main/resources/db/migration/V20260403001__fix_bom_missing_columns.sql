-- 修复BOM清单缺失的列（group_name, fabric_weight）
-- 原迁移脚本使用SQL Server语法导致执行失败

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'group_name') = 0,
  'ALTER TABLE `t_style_bom` ADD COLUMN `group_name` VARCHAR(100) DEFAULT NULL COMMENT ''分组名称''',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s2 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'fabric_weight') = 0,
  'ALTER TABLE `t_style_bom` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT ''克重''',
  'SELECT 1'
);
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
