-- 添加供应商唯一约束，防止并发创建重复供应商
-- 关联铁律：P0 #4（多租户隔离）+ 数据完整性

-- 1. 先清理可能存在的重复供应商（同一租户、同一名称、同一类型）
-- 只保留最早创建的供应商，删除后续重复的
DELETE f1 FROM t_factory f1
INNER JOIN t_factory f2
WHERE f1.tenant_id = f2.tenant_id
  AND f1.factory_name = f2.factory_name
  AND f1.supplier_type = f2.supplier_type
  AND (f1.delete_flag = f2.delete_flag OR (f1.delete_flag IS NULL AND f2.delete_flag IS NULL) OR (f1.delete_flag = 0 AND f2.delete_flag = 0))
  AND f1.id > f2.id;  -- 保留id较小的（更早创建的）

-- 2. 添加唯一约束（幂等：先检查是否存在）
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 't_factory'
   AND CONSTRAINT_NAME = 'uk_factory_name_tenant_supplier_type') = 0,
  CONCAT('ALTER TABLE t_factory ADD UNIQUE KEY uk_factory_name_tenant_supplier_type (tenant_id, factory_name, supplier_type)'),
  'SELECT 1'
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 为已删除的供应商添加条件（允许已删除的供应商名称被重新使用）
-- MySQL 不支持部分唯一索引，所以我们需要确保 delete_flag 的语义
-- 当 delete_flag = 1 时，供应商已删除，可以重新创建同名供应商
-- 解决方案：在应用层处理，或使用软删除视图