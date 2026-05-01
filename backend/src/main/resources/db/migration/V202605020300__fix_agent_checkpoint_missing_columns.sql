-- V202605020300__fix_agent_checkpoint_missing_columns.sql
--
-- 补偿脚本：修复 t_agent_checkpoint 因 V20260513001 静默失败导致的列缺失问题
--
-- 根因：V20260513001 中 SET @alter_sql = IF(... CONCAT('... DEFAULT '''' ...')) 块
--       包含 '''' 和 ''ACTIVE'' 两处双引号转义，触发 Flyway SQL 解析器的已知 Bug：
--       Flyway 将第一个 '' 识别为字符串结束符，导致完整 ALTER TABLE 语句被截断，
--       PREPARE stmt 实际执行的是 SELECT 1，新列永远未被添加到云端数据库。
--       但 @drop_sql 块（无 '' 嵌套）正常执行，旧列 session_id/iteration 等已被删除。
--
-- 修复范围：在 t_agent_checkpoint 上幂等地添加全部缺失的 8 个新列及 3 个索引
-- 修复策略：每列独立 SET @s = IF(...)，列定义全部用 NULL 避免 DEFAULT '' 的 '' 引号嵌套问题
--           （Java 实体每次 INSERT 时均赋值，NULL 不影响业务正确性）
--
-- ❌ 永久规律（本脚本印证）：
--    禁止在 SET @s = IF(... 'ALTER TABLE ... DEFAULT ''''...') 中嵌套 '' 转义单引号
--    字段注释请写在 SQL 文件行注释中，不要放进动态 SQL 字符串

SET @dbname = DATABASE();

-- 1. 添加 tenant_id（V20260513001 从未添加过该列）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'tenant_id') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 添加 thread_id（V20260513001 因 '' 静默跳过，未添加）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'thread_id') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `thread_id` VARCHAR(128) NULL AFTER `tenant_id`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 添加 node_id
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'node_id') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `node_id` VARCHAR(128) NULL AFTER `thread_id`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. 添加 node_name
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'node_name') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `node_name` VARCHAR(256) NULL AFTER `node_id`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. 添加 state_json（检查点快照，MEDIUMTEXT 支持大型状态）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'state_json') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `state_json` MEDIUMTEXT NULL AFTER `node_name`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. 添加 metadata_json（元数据：totalTokens、route 等）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'metadata_json') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `metadata_json` TEXT NULL AFTER `state_json`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. 添加 step_index（迭代序号，用于 rollback 和排序）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'step_index') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `step_index` INT NOT NULL DEFAULT 0 AFTER `metadata_json`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. 添加 status（取值 ACTIVE/COMPLETED，代码中写入时赋值，无需 DEFAULT 空串）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND COLUMN_NAME = 'status') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD COLUMN `status` VARCHAR(32) NULL AFTER `step_index`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. 添加联合索引 idx_acp_tenant_thread（用于 selectLatestActive 查询：tenant_id + thread_id）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND INDEX_NAME = 'idx_acp_tenant_thread') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD INDEX idx_acp_tenant_thread (tenant_id, thread_id)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. 添加联合索引 idx_acp_thread_step（用于 rollback 查询：thread_id + step_index）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND INDEX_NAME = 'idx_acp_thread_step') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD INDEX idx_acp_thread_step (thread_id, step_index)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11. 添加状态索引 idx_acp_status（用于按 status 过滤）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_agent_checkpoint' AND INDEX_NAME = 'idx_acp_status') = 0,
    'ALTER TABLE `t_agent_checkpoint` ADD INDEX idx_acp_status (status)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
