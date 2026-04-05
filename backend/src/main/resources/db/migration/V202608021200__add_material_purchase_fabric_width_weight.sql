-- 补齐 t_material_purchase 表缺失的面料幅宽和克重字段
-- 这两个字段从物料资料库同步到采购单，使采购/进销存/领料流程中可显示完整面料属性
-- fabric_width: 面料幅宽（如 "150cm"）
-- fabric_weight: 面料克重（如 "280g/m²"）

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_width` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_weight` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
