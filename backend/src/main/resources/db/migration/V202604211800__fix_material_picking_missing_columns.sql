-- ============================================================
-- V202604211800 — 修复 t_material_picking + t_material_picking_item 缺列
-- 根因：早期 Flyway 脚本含 COMMENT '' 语法导致 Silent failure，
--       Flyway 链中断后 pickup_type / usage_type / tenant_id 等列可能未创建
-- 规则：全部使用 INFORMATION_SCHEMA 幂等判断，动态 SQL 内禁止 COMMENT
-- ============================================================

-- ===================== t_material_picking (3 columns) =====================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='pickup_type')=0,
    'ALTER TABLE `t_material_picking` ADD COLUMN `pickup_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='usage_type')=0,
    'ALTER TABLE `t_material_picking` ADD COLUMN `usage_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_picking` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND INDEX_NAME='idx_mp_tenant_id')=0,
    'CREATE INDEX `idx_mp_tenant_id` ON `t_material_picking` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== t_material_picking_item (8 columns) =====================

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

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND INDEX_NAME='idx_mpi_tenant_id')=0,
    'CREATE INDEX `idx_mpi_tenant_id` ON `t_material_picking_item` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================== 完成 =====================
