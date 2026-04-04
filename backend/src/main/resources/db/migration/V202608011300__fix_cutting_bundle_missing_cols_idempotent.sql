-- V202608011300: 幂等补齐 t_cutting_bundle 扩展列
-- 修复原因：V20260325008 使用非幂等 ADD COLUMN（多列单语句），
--   若云端任意一列已存在，整条 ALTER TABLE 失败导致列缺失；
--   V202604020010 补充 bed_sub_no（已幂等）。
-- 本脚本覆盖以上所有列，使用 INFORMATION_SCHEMA 守卫确保幂等。

-- root_bundle_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='root_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `root_bundle_id` VARCHAR(64) DEFAULT NULL AFTER `id`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- parent_bundle_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='parent_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `parent_bundle_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- source_bundle_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='source_bundle_id')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `source_bundle_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bundle_label
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='bundle_label')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `bundle_label` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- split_status: DEFAULT NULL 先占位，再 UPDATE 回填（避免 '' 在 Flyway 解析器导致 Silent Failure）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='split_status')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填：对尚未有 split_status 值的行设为 normal
UPDATE `t_cutting_bundle` SET `split_status` = 'normal' WHERE `split_status` IS NULL;

-- split_seq
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='split_seq')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `split_seq` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bed_sub_no (already covered by V202604020010, kept for completeness)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND COLUMN_NAME='bed_sub_no')=0,
    'ALTER TABLE `t_cutting_bundle` ADD COLUMN `bed_sub_no` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 索引（幂等：CREATE INDEX 不报错若已存在需要 IF NOT EXISTS 但 MySQL 8.0+ 才支持，使用 INFORMATION_SCHEMA 守卫）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND INDEX_NAME='idx_cb_root_bundle_id')=0,
    'CREATE INDEX `idx_cb_root_bundle_id` ON `t_cutting_bundle` (`root_bundle_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
    AND INDEX_NAME='idx_cb_split_status')=0,
    'CREATE INDEX `idx_cb_split_status` ON `t_cutting_bundle` (`split_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
