-- 面辅料数据库补充字段：颜色、面料属性（幅宽/克重/成分）
-- 使用 INFORMATION_SCHEMA 幂等写法，云端 Flyway 安全执行

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='color')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `color` VARCHAR(100) NULL COMMENT ''颜色''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_width` VARCHAR(50) NULL COMMENT ''幅宽''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_weight` VARCHAR(50) NULL COMMENT ''克重''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_composition')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_composition` VARCHAR(100) NULL COMMENT ''面料成分''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
