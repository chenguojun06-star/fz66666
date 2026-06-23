-- ============================================================
-- V202606240002: 为 t_logistics_provider 添加 tenant_id 列
-- 原因：不同租户需要独立的物流服务商配置（API密钥、账单账号等）
-- 多租户隔离：防止跨租户数据访问
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_logistics_provider';
SET @columnname = 'tenant_id';

SET @query = CONCAT('SELECT COUNT(*) INTO @count FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND COLUMN_NAME = ''', @columnname, '''');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@count = 0,
    'ALTER TABLE t_logistics_provider ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id',
    'SELECT 1');
PREPARE stmt2 FROM @sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 幂等添加索引
SET @idx_query = CONCAT('SELECT COUNT(*) INTO @idx_count FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND INDEX_NAME = ''', 'idx_tenant_provider_code', '''');

PREPARE idx_stmt FROM @idx_query;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

SET @idx_sql = IF(@idx_count = 0,
    'ALTER TABLE t_logistics_provider ADD INDEX idx_tenant_provider_code (tenant_id, provider_code)',
    'SELECT 1');
PREPARE idx_stmt2 FROM @idx_sql;
EXECUTE idx_stmt2;
DEALLOCATE PREPARE idx_stmt2;
