-- ============================================================
-- V202608051300 — 综合补列：修复 4 张表共 27 个缺失列
-- 根因：多个早期 Flyway 脚本含 COMMENT '' 语法导致 Silent failure，
--       Flyway 链中断后所有后续迁移未执行，云端大面积缺列 500。
-- 覆盖表：t_style_info / t_material_purchase / t_material_picking_item / t_cutting_bundle
-- 规则：全部使用 INFORMATION_SCHEMA 幂等判断，动态 SQL 内禁止 COMMENT
-- ============================================================

-- ===================== t_style_info (1 column) =====================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pushed_by_name')=0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pushed_by_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== t_material_purchase (12 columns) =====================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_width` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_weight` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='supplier_contact_person')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='supplier_contact_phone')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='return_confirmed')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmed` TINYINT(1) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='return_quantity')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `return_quantity` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='return_confirmer_id')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmer_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='return_confirmer_name')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmer_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='return_confirm_time')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirm_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='expected_ship_date')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `expected_ship_date` DATE DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='source_type')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `source_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='pattern_production_id')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `pattern_production_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== t_material_picking_item (7 columns) =====================

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

-- ===================== t_cutting_bundle (7 columns) =====================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='root_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `root_bundle_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='parent_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `parent_bundle_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='source_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `source_bundle_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='bundle_label')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `bundle_label` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='split_status')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填 split_status 默认值
UPDATE `t_cutting_bundle` SET `split_status` = 'normal' WHERE `split_status` IS NULL;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='split_seq')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_seq` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle' AND COLUMN_NAME='bed_sub_no')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `bed_sub_no` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== 完成 =====================
