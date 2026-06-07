-- ==================================================================
-- 支持月付/年付计费周期（幂等：跳过已存在的列）
-- ==================================================================

-- 1. 给 t_tenant 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER storage_used_mb');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 给 t_tenant_billing_record 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER plan_type');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
