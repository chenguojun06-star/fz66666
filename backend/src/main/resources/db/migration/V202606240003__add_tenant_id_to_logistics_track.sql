-- ============================================================
-- V202606240003: 为 t_logistics_track 添加 tenant_id 列
-- 原因：物流轨迹数据包含敏感信息（收件人地址、电话等），需要多租户隔离
-- 关联：通过 express_order_id 关联到 t_express_order，再关联到生产订单获取 tenant_id
-- 但直接存储 tenant_id 可提高查询效率
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_logistics_track';
SET @columnname = 'tenant_id';

SET @query = CONCAT('SELECT COUNT(*) INTO @count FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND COLUMN_NAME = ''', @columnname, '''');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@count = 0,
    'ALTER TABLE t_logistics_track ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id',
    'SELECT 1');
PREPARE stmt2 FROM @sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 幂等添加索引
SET @idx_query = CONCAT('SELECT COUNT(*) INTO @idx_count FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND INDEX_NAME = ''', 'idx_tenant_tracking', '''');

PREPARE idx_stmt FROM @idx_query;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

SET @idx_sql = IF(@idx_count = 0,
    'ALTER TABLE t_logistics_track ADD INDEX idx_tenant_tracking (tenant_id, tracking_no)',
    'SELECT 1');
PREPARE idx_stmt2 FROM @idx_sql;
EXECUTE idx_stmt2;
DEALLOCATE PREPARE idx_stmt2;
