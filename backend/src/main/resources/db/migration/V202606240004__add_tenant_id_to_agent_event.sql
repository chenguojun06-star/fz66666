-- ============================================================
-- V202606240004: 为 t_agent_event 添加 tenant_id 列
-- 原因：AI智能体事件记录需要多租户隔离，支持按租户查询和分析
-- 关联：通过 session_id 关联到 t_agent_session（已有 tenant_id）
-- 但直接存储 tenant_id 可简化查询逻辑
-- ============================================================

SET @dbname = DATABASE();
SET @tablename = 't_agent_event';
SET @columnname = 'tenant_id';

SET @query = CONCAT('SELECT COUNT(*) INTO @count FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND COLUMN_NAME = ''', @columnname, '''');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@count = 0,
    'ALTER TABLE t_agent_event ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER id',
    'SELECT 1');
PREPARE stmt2 FROM @sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 幂等添加索引
SET @idx_query = CONCAT('SELECT COUNT(*) INTO @idx_count FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = ''', @dbname, '''
AND TABLE_NAME = ''', @tablename, '''
AND INDEX_NAME = ''', 'idx_tenant_session', '''');

PREPARE idx_stmt FROM @idx_query;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;

SET @idx_sql = IF(@idx_count = 0,
    'ALTER TABLE t_agent_event ADD INDEX idx_tenant_session (tenant_id, session_id)',
    'SELECT 1');
PREPARE idx_stmt2 FROM @idx_sql;
EXECUTE idx_stmt2;
DEALLOCATE PREPARE idx_stmt2;
