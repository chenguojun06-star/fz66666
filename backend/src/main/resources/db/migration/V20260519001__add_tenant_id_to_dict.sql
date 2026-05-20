-- ============================================================
-- V20260519001: 为 t_dict 添加 tenant_id 列及索引
-- 幂等写法：通过 INFORMATION_SCHEMA 检测列/索引是否已存在
-- 背景：SystemTableMigrator.ensureDictTable() 建表时已含 tenant_id + 两个索引，
--       云端可能已存在，直接 ALTER/CREATE INDEX 会报 Duplicate column/index。
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_dict' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_dict` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_dict' AND INDEX_NAME='idx_dict_tenant_id')=0,
    'CREATE INDEX `idx_dict_tenant_id` ON `t_dict` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_dict' AND INDEX_NAME='idx_dict_type_tenant')=0,
    'CREATE INDEX `idx_dict_type_tenant` ON `t_dict` (`dict_type`, `tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
