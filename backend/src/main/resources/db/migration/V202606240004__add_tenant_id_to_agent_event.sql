-- ============================================================
-- V202606240004: 为 t_agent_event 添加 tenant_id 列
-- 原因：AI智能体事件记录需要多租户隔离，支持按租户查询和分析
-- 注意：表不存在时跳过
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_agent_event';

SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tablename;

SET @sql = IF(@table_exists = 0,
    'SELECT ''t_agent_event table not exists, skip'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN IF NOT EXISTS tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_sql = IF(@table_exists = 0,
    'SELECT ''skip index'' AS msg',
    CONCAT('ALTER TABLE ', @tablename, ' ADD INDEX IF NOT EXISTS idx_tenant_session (tenant_id, session_id)')
);
PREPARE idx_stmt FROM @idx_sql;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
