-- ============================================================
-- V202606240001: 为 t_integration_callback_log 添加 tenant_id 列
-- 问题：IntegrationCallbackLogMapper 已使用 tenant_id 查询，但表和Entity都没有此列
-- 修复：添加 tenant_id 列 + 索引，修复同步Entity
-- ============================================================

-- 幂等添加 tenant_id 列
SET @dbname = DATABASE();
SET @tablename = 't_integration_callback_log';
SET @columnname = 'tenant_id';

SET @query = CONCAT('SELECT COUNT(*) INTO @count FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND COLUMN_NAME = ''', @columnname, '''');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@count = 0,
    'ALTER TABLE t_integration_callback_log ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id',
    'SELECT 1');
PREPARE stmt2 FROM @sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 幂等添加索引
SET @idx_query = CONCAT('SELECT COUNT(*) INTO @idx_count FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND INDEX_NAME = ''', 'idx_tenant_order', '''');

PREPARE idx_stmt FROM @idx_query;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

SET @idx_sql = IF(@idx_count = 0,
    'ALTER TABLE t_integration_callback_log ADD INDEX idx_tenant_order (tenant_id, related_order_id)',
    'SELECT 1');
PREPARE idx_stmt2 FROM @idx_sql;
EXECUTE idx_stmt2;
DEALLOCATE PREPARE idx_stmt2;
