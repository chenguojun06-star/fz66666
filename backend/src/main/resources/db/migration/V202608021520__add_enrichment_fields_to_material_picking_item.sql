-- 为 t_material_picking_item 添加富化字段（规格、单价、幅宽、成分、供应商、库位、物料类型）
-- 解决 BOM 领取出库后打印单/领取记录缺少关键信息的问题

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='specification')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `specification` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='unit_price')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `unit_price` DECIMAL(12,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `fabric_width` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='fabric_composition')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='supplier_name')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `supplier_name` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='warehouse_location')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `warehouse_location` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='material_type')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `material_type` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 修复存量 pickupType 值：'内部' → 'INTERNAL'
UPDATE `t_material_picking` SET `pickup_type` = 'INTERNAL' WHERE `pickup_type` = '内部';
UPDATE `t_material_picking` SET `pickup_type` = 'EXTERNAL' WHERE `pickup_type` = '外部';
