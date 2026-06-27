-- ============================================================
-- V202606240001: 为 t_integration_callback_log 添加 tenant_id 列
-- 问题：IntegrationCallbackLogMapper 已使用 tenant_id 查询，但表和Entity都没有此列
-- 修复：添加 tenant_id 列 + 索引，修复同步Entity
-- 注意：表不存在时跳过（集成模块可能未启用）
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_integration_callback_log';

SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename;

SET @sql = IF(@table_exists = 0,
    'SELECT ''t_integration_callback_log table not exists, skip'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_sql = IF(@table_exists = 0,
    'SELECT ''skip index'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX IF NOT EXISTS idx_tenant_order (tenant_id, related_order_id)')
);
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
