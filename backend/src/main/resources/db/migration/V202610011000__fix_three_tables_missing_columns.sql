-- =====================================================================
-- V202610011000: 修复3张表缺列导致云端MyBatis setting parameters 500
--
-- 问题根因（2026-04-15 云端日志）：
--   1) t_ai_job_run_log 缺少 tenant_id 列（V20260413001创建时遗漏）
--   2) t_shipment_reconciliation 缺少 auditor_id / auditor_name / audit_time
--      （V20260223b 的 CONTINUE HANDLER 静默吞掉了 INDEX 创建错误，实际列也未添加）
--   3) t_sys_notice 可能因 Flyway 链断裂未被创建（V20260322b 未执行到）
--
-- 所有操作均为幂等（INFORMATION_SCHEMA 检查 + CREATE TABLE IF NOT EXISTS）
-- =====================================================================

-- -------------------------------------------------------------------
-- 1. t_ai_job_run_log — 补齐 tenant_id 列
-- -------------------------------------------------------------------
-- 先确保表存在（Flyway 链断裂可能导致 V20260413001 未执行）
CREATE TABLE IF NOT EXISTS `t_ai_job_run_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT DEFAULT NULL,
    `job_name` VARCHAR(100) DEFAULT NULL,
    `method_name` VARCHAR(100) DEFAULT NULL,
    `start_time` DATETIME DEFAULT NULL,
    `duration_ms` BIGINT DEFAULT NULL,
    `status` VARCHAR(20) DEFAULT NULL,
    `tenant_count` INT DEFAULT NULL,
    `result_summary` VARCHAR(500) DEFAULT NULL,
    `error_message` TEXT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_ajrl_tenant` (`tenant_id`),
    INDEX `idx_ajrl_job_time` (`job_name`, `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 如果表已存在但缺少 tenant_id（V20260413001 创建时未包含此列）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_ai_job_run_log` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL AFTER `id`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 补齐 tenant_id 索引
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND INDEX_NAME='idx_ajrl_tenant')=0,
    'CREATE INDEX `idx_ajrl_tenant` ON `t_ai_job_run_log` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------
-- 2. t_shipment_reconciliation — 补齐 auditor_id / auditor_name / audit_time
-- -------------------------------------------------------------------
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='auditor_id')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `auditor_id` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='auditor_name')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `auditor_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='audit_time')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `audit_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- auditor_id 索引（V20260223b 曾尝试创建但因列不存在而静默失败）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND INDEX_NAME='idx_sr_auditor')=0,
    'CREATE INDEX `idx_sr_auditor` ON `t_shipment_reconciliation` (`auditor_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------
-- 3. t_sys_notice — 确保表存在 + content 扩容为 TEXT
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_sys_notice` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT DEFAULT NULL,
    `to_name` VARCHAR(50) DEFAULT NULL,
    `from_name` VARCHAR(50) DEFAULT NULL,
    `order_no` VARCHAR(50) DEFAULT NULL,
    `title` VARCHAR(200) DEFAULT NULL,
    `content` TEXT DEFAULT NULL,
    `notice_type` VARCHAR(50) DEFAULT NULL,
    `is_read` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_sn_tenant` (`tenant_id`),
    INDEX `idx_sn_to_name` (`to_name`),
    INDEX `idx_sn_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 如果 content 列类型仍为 VARCHAR(512)，扩容为 TEXT（防止 SmartNotifyJob 写入超长异常描述被截断）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='content'
    AND DATA_TYPE='varchar')>0,
    'ALTER TABLE `t_sys_notice` MODIFY COLUMN `content` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
