-- ============================================================
-- V202606240003: 为 t_logistics_track 添加 tenant_id 列
-- 原因：物流轨迹数据包含敏感信息（收件人地址、电话等），需要多租户隔离
-- 注意：表不存在时跳过（物流模块为预留功能，可能未创建表）
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_logistics_track';

SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename;

SET @sql = IF(@table_exists = 0,
    'SELECT ''t_logistics_track table not exists, skip'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_sql = IF(@table_exists = 0,
    'SELECT ''skip index'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX IF NOT EXISTS idx_tenant_tracking (tenant_id, tracking_no)')
);
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
