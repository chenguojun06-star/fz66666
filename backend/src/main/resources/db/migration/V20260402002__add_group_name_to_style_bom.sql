-- 为BOM清单添加分组字段
-- 用于套装、亲子装等场景，不同部位/款式的物料分组管理

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'group_name') = 0,
  'ALTER TABLE `t_style_bom` ADD COLUMN `group_name` VARCHAR(100) DEFAULT NULL COMMENT ''分组名称（如：上衣、裤子、亲子装-大人款、亲子装-儿童款）''',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
