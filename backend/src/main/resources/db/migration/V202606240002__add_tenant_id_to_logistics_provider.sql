-- ============================================================
-- V202606240002: 为 t_logistics_provider 添加 tenant_id 列
-- 原因：不同租户需要独立的物流服务商配置（API密钥、账单账号等）
-- 多租户隔离：防止跨租户数据访问
-- 注意：表不存在时跳过（物流模块为预留功能，可能未创建表）
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_logistics_provider';
SET @columnname = 'tenant_id';

SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename;

SET @sql = IF(@table_exists = 0,
    'SELECT ''t_logistics_provider table not exists, skip'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_sql = IF(@table_exists = 0,
    'SELECT ''skip index'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX IF NOT EXISTS idx_tenant_provider_code (tenant_id, provider_code)')
);
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
