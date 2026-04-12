-- ============================================================
-- 为 t_production_order 和 t_style_info 补充 tenant_id 单列索引
-- 多租户查询场景下避免全表扫描
-- 幂等写法：先通过 INFORMATION_SCHEMA 检测索引是否存在
-- ============================================================

-- 1. t_production_order: tenant_id 单列索引
-- 现有索引覆盖 style_no/factory_id/status 等维度，但缺少 tenant_id 单列索引
-- TenantInterceptor 自动追加 WHERE tenant_id = ? 条件，此索引为多租户查询核心
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_production_order_tenant_id') = 0,
    'CREATE INDEX idx_production_order_tenant_id ON t_production_order (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_production_order: tenant_id + status 复合索引
-- 列表查询高频组合: WHERE tenant_id = ? AND status = ? AND delete_flag = 0
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_production_order_tenant_status') = 0,
    'CREATE INDEX idx_production_order_tenant_status ON t_production_order (tenant_id, status, delete_flag)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. t_style_info: tenant_id 单列索引
-- 款式列表查询: WHERE tenant_id = ? AND delete_flag = 0
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND INDEX_NAME='idx_style_info_tenant_id') = 0,
    'CREATE INDEX idx_style_info_tenant_id ON t_style_info (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
