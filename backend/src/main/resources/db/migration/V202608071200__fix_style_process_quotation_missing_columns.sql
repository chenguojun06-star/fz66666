-- =====================================================================
-- V202608071200 — 修复 t_style_process / t_style_quotation 缺失列
-- 云端 Flyway 链断裂导致部分 ALTER TABLE 从未执行
-- 全部幂等 INFORMATION_SCHEMA + PREPARE/EXECUTE，禁止 COMMENT 子句
-- =====================================================================

-- ===== t_style_process =====

-- difficulty VARCHAR(10) — 工序难度
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_process' AND COLUMN_NAME = 'difficulty') = 0,
    'ALTER TABLE `t_style_process` ADD COLUMN `difficulty` VARCHAR(10) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- rate_multiplier DECIMAL(5,2) — 工序倍率
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_process' AND COLUMN_NAME = 'rate_multiplier') = 0,
    'ALTER TABLE `t_style_process` ADD COLUMN `rate_multiplier` DECIMAL(5,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id BIGINT — 租户 ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_process' AND COLUMN_NAME = 'tenant_id') = 0,
    'ALTER TABLE `t_style_process` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== t_style_quotation =====

-- tenant_id BIGINT — 租户 ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'tenant_id') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- creator_id VARCHAR(32) — 创建人 ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'creator_id') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `creator_id` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- creator_name VARCHAR(100) — 创建人名称
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'creator_name') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- updater_id VARCHAR(32) — 更新人 ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'updater_id') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `updater_id` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- updater_name VARCHAR(100) — 更新人名称
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'updater_name') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- auditor_id VARCHAR(32) — 审核人 ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'auditor_id') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `auditor_id` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- auditor_name VARCHAR(100) — 审核人名称
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'auditor_name') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `auditor_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- audit_time DATETIME — 审核时间
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'audit_time') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `audit_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- audit_status INT NOT NULL DEFAULT 0 — 审核状态
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'audit_status') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `audit_status` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- audit_remark VARCHAR(500) — 审核备注
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_quotation' AND COLUMN_NAME = 'audit_remark') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `audit_remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
