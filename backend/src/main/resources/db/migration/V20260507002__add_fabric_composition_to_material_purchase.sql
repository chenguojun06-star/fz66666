-- 向 t_material_purchase 表添加 fabric_composition（面料成分）列
-- 采购记录从物料资料库选料时自动带入该字段

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_purchase'
       AND COLUMN_NAME = 'fabric_composition') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL COMMENT ''面料成分（从物料资料库同步）'' AFTER `size`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
