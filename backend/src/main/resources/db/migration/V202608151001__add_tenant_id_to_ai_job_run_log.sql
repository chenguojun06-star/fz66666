-- ============================================================
-- V202608151001: 为 t_ai_job_run_log 添加 tenant_id 列
--
-- 原表（V202608151000 创建）缺少 tenant_id，导致：
-- 1. TenantInterceptor 无法自动追加租户过滤
-- 2. 多租户环境下所有租户的 AI 任务日志混在一起
--
-- 幂等写法：通过 INFORMATION_SCHEMA 检测列是否存在
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_ai_job_run_log` ADD COLUMN `tenant_id` BIGINT NULL AFTER `id`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_job_run_log' AND INDEX_NAME='idx_ai_job_run_log_tenant_id')=0,
    'CREATE INDEX `idx_ai_job_run_log_tenant_id` ON `t_ai_job_run_log` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
