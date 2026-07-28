-- 修复 V202707272000 幂等BUG
-- 问题：V202707272000 第71行使用 IF(@idx>=0, ...) 永真条件，重跑迁移时会因索引已存在而失败
-- 该BUG不影响首次执行（首次执行时idx_source_tenant不存在，ADD成功），但破坏幂等性
-- 本迁移脚本：清理可能残留的 idx_source_tenant 普通索引，确保 uk_source_active 唯一索引生效
-- 关联铁律：P0 #1 Flyway迁移必须幂等

-- 1. 检查并清理 V202707272000 创建的 idx_source_tenant 普通索引（如果存在）
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_aggregation' AND INDEX_NAME='idx_source_tenant');
SET @s_drop = IF(@idx>0, 'ALTER TABLE t_bill_aggregation DROP INDEX idx_source_tenant', 'SELECT 1');
PREPARE stmt FROM @s_drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 确保 uk_source_active 唯一索引存在（V202707280001 已创建，此处仅兜底幂等检查）
SET @idx2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_aggregation' AND INDEX_NAME='uk_source_active');
SET @s_add = IF(@idx2=0,
  'ALTER TABLE t_bill_aggregation ADD UNIQUE KEY uk_source_active (source_type, source_id, tenant_id, delete_flag)',
  'SELECT 1');
PREPARE stmt FROM @s_add; EXECUTE stmt; DEALLOCATE PREPARE stmt;
