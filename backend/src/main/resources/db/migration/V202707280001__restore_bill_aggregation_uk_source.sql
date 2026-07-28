-- 恢复 BillAggregation uk_source 唯一索引（复合唯一含 delete_flag）
-- 修复 V202707272000 将唯一索引降级为普通索引的并发幂等风险
-- 使用 (source_type, source_id, tenant_id, delete_flag) 复合唯一索引：
--   - 未删除记录 (delete_flag=0) 唯一
--   - 已删除记录 (delete_flag=1) 不约束，允许同来源重新创建

-- 1. 删除 V202707272000 创建的普通索引 idx_source_tenant
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_aggregation' AND INDEX_NAME='idx_source_tenant');
SET @s_drop = IF(@idx>0, 'ALTER TABLE t_bill_aggregation DROP INDEX idx_source_tenant', 'SELECT 1');
PREPARE stmt FROM @s_drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 检查是否已存在 uk_source_active，避免重复创建
SET @idx2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_aggregation' AND INDEX_NAME='uk_source_active');
SET @s_add = IF(@idx2=0, 'ALTER TABLE t_bill_aggregation ADD UNIQUE KEY uk_source_active (source_type, source_id, tenant_id, delete_flag)', 'SELECT 1');
PREPARE stmt FROM @s_add; EXECUTE stmt; DEALLOCATE PREPARE stmt;
