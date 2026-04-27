-- V47: 补齐 t_material_database 云端缺失列
-- 问题: completed_time / return_reason / supplier_id / supplier_contact_* 在云端从未添加
-- 导致: PUT /api/material/database/{id}/return → BadSqlGrammarException → 500
-- 所有语句均使用 INFORMATION_SCHEMA 幂等写法，安全重复执行

-- completed_time: 物料完成时间
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_database' AND COLUMN_NAME = 'completed_time') = 0,
    'ALTER TABLE `t_material_database` ADD COLUMN `completed_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- return_reason: 退回原因（退回编辑时记录）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_database' AND COLUMN_NAME = 'return_reason') = 0,
    'ALTER TABLE `t_material_database` ADD COLUMN `return_reason` VARCHAR(255) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_id: 供应商ID（关联 t_factory）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_database' AND COLUMN_NAME = 'supplier_id') = 0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_id` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_person: 供应商联系人
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_database' AND COLUMN_NAME = 'supplier_contact_person') = 0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_contact_phone: 供应商联系电话
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_database' AND COLUMN_NAME = 'supplier_contact_phone') = 0,
    'ALTER TABLE `t_material_database` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 添加 supplier_id 索引（提升按供应商查询性能）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_supplier_id')=0,'CREATE INDEX idx_md_supplier_id ON t_material_database (supplier_id)','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
