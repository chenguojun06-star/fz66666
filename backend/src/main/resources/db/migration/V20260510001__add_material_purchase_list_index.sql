-- ============================================================
-- t_material_purchase 分页列表查询复合索引
-- 解决：MaterialPurchaseServiceImpl.queryPage 慢查询（实测 2330ms，阈值1000ms）
-- 原因：list 查询 WHERE delete_flag=0 ORDER BY create_time DESC 走全表扫描
-- 修复：新增 (tenant_id, delete_flag, create_time) 复合索引，加速 90% 的分页列表请求
-- ============================================================

SET @idx_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_purchase'
      AND INDEX_NAME   = 'idx_mpu_tenant_delete_create'
);
SET @s = IF(@idx_exists = 0,
    'ALTER TABLE `t_material_purchase` ADD INDEX `idx_mpu_tenant_delete_create` (`tenant_id`, `delete_flag`, `create_time`)',
    'SELECT 1 /* idx_mpu_tenant_delete_create already exists */'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
