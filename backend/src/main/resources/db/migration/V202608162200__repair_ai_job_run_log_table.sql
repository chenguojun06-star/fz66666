-- ============================================================
-- V202608162200: 修复 t_ai_job_run_log 表缺失问题
--
-- 根本原因：V202608151000 已在 flyway_schema_history 中记录为"成功"，
-- 但云端 DB 在某次恢复/重置后丢失了该表，Flyway 不会重跑已有记录的脚本。
-- 本脚本使用新版本号，确保 Flyway 将其视为待执行的新迁移。
--
-- 幂等安全：
--   1. CREATE TABLE IF NOT EXISTS — 表存在时无副作用
--   2. tenant_id 通过 INFORMATION_SCHEMA 条件添加 — 列存在时无副作用
-- ============================================================

-- Step 1: 确保表存在（含所有字段，包含 tenant_id）
CREATE TABLE IF NOT EXISTS `t_ai_job_run_log` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT        DEFAULT NULL,
  `job_name`        VARCHAR(100)  NOT NULL,
  `method_name`     VARCHAR(100)  DEFAULT NULL,
  `start_time`      DATETIME      NOT NULL,
  `duration_ms`     BIGINT        DEFAULT NULL,
  `status`          VARCHAR(20)   NOT NULL,
  `tenant_count`    INT           DEFAULT NULL,
  `result_summary`  VARCHAR(500)  DEFAULT NULL,
  `error_message`   TEXT          DEFAULT NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ai_job_run_log_tenant_id` (`tenant_id`),
  INDEX `idx_job_start` (`job_name`, `start_time`),
  INDEX `idx_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: 若表早已存在但缺少 tenant_id 列，则补充该列
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_ai_job_run_log` ADD COLUMN `tenant_id` BIGINT NULL AFTER `id`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Step 3: 若 tenant_id 索引缺失则补充
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND INDEX_NAME='idx_ai_job_run_log_tenant_id')=0,
    'CREATE INDEX `idx_ai_job_run_log_tenant_id` ON `t_ai_job_run_log` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
