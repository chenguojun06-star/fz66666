-- ========================================================================
-- 修复 V202606240001/002/003 中的 MySQL 8.0 不兼容语法
-- 问题：ADD COLUMN IF NOT EXISTS / ADD INDEX IF NOT EXISTS 在 MySQL 8.0 中不支持
-- 本迁移用 INFORMATION_SCHEMA 守卫 + 纯 ALTER TABLE 替代
-- ========================================================================

SET @dbname = DATABASE();

-- -------- t_integration_callback_log --------
SET @tbl_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_integration_callback_log');
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_integration_callback_log' AND COLUMN_NAME = 'tenant_id');
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_integration_callback_log' AND INDEX_NAME = 'idx_tenant_order');

SET @sql = IF(@tbl_exists = 0 OR @col_exists > 0, 'SELECT ''skip column'' AS msg',
    'ALTER TABLE t_integration_callback_log ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_sql = IF(@tbl_exists = 0 OR @idx_exists > 0, 'SELECT ''skip index'' AS msg',
    'ALTER TABLE t_integration_callback_log ADD INDEX idx_tenant_order (tenant_id, related_order_id)');
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

-- -------- t_logistics_provider --------
SET @tbl2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_provider');
SET @col2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_provider' AND COLUMN_NAME = 'tenant_id');
SET @idx2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_provider' AND INDEX_NAME = 'idx_tenant_provider_code');

SET @sql2 = IF(@tbl2_exists = 0 OR @col2_exists > 0, 'SELECT ''skip column'' AS msg',
    'ALTER TABLE t_logistics_provider ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_sql2 = IF(@tbl2_exists = 0 OR @idx2_exists > 0, 'SELECT ''skip index'' AS msg',
    'ALTER TABLE t_logistics_provider ADD INDEX idx_tenant_provider_code (tenant_id, provider_code)');
PREPARE idx_stmt2 FROM @idx_sql2;
EXECUTE idx_stmt2;
DEALLOCATE PREPARE idx_stmt2;

-- -------- t_logistics_track --------
SET @tbl3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_track');
SET @col3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_track' AND COLUMN_NAME = 'tenant_id');
SET @idx3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_logistics_track' AND INDEX_NAME = 'idx_tenant_tracking');

SET @sql3 = IF(@tbl3_exists = 0 OR @col3_exists > 0, 'SELECT ''skip column'' AS msg',
    'ALTER TABLE t_logistics_track ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @idx_sql3 = IF(@tbl3_exists = 0 OR @idx3_exists > 0, 'SELECT ''skip index'' AS msg',
    'ALTER TABLE t_logistics_track ADD INDEX idx_tenant_tracking (tenant_id, tracking_no)');
PREPARE idx_stmt3 FROM @idx_sql3;
EXECUTE idx_stmt3;
DEALLOCATE PREPARE idx_stmt3;
