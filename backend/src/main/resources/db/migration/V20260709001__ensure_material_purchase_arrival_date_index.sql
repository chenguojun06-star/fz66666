-- ========================================================================
-- 确保 t_material_purchase 复合索引存在（PREPARE/EXECUTE 幂等模式）
-- 背景：V20260623005 使用 DELIMITER + CREATE PROCEDURE，在 Flyway 中有静默失败风险
-- 本迁移用 PREPARE/EXECUTE 模式重新确保索引存在，已存在则跳过
-- 索引用途：优化 actual_arrival_date 范围查询（仓库看板日/周/月/年趋势统计）
-- ========================================================================

SET @idx_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_material_purchase'
      AND INDEX_NAME = 'idx_mpu_tenant_delete_arrival_date'
);

SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_mpu_tenant_delete_arrival_date ON t_material_purchase (tenant_id, delete_flag, actual_arrival_date)',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
