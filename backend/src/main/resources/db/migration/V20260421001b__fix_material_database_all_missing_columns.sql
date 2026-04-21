-- V20260421001: 修复面辅料数据库页面 500 错误
-- 问题根因: t_material_database 云端缺少以下列（V20260314002 可能未正确执行或已有 Flyway 记录但列未创建）
-- 修复方法: 新版本号确保 Flyway 一定执行本脚本，逐列补齐所有缺失字段
-- 影响: GET /api/material/database/list 500 -> 200

-- color
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='color')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `color` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_width
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_width')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_width` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_weight
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_composition
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='fabric_composition')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `fabric_composition` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_id')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_id` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_person
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_person')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_phone
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='supplier_contact_phone')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_time
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='completed_time')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `completed_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- return_reason
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='return_reason')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `return_reason` VARCHAR(255) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_md_supplier_id
SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_supplier_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_md_supplier_id` ON `t_material_database` (`supplier_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_md_tenant_id
SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_tenant_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_md_tenant_id` ON `t_material_database` (`tenant_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
