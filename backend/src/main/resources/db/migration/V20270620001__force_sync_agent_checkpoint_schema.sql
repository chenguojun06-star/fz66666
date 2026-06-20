-- V20270620001__force_sync_agent_checkpoint_schema.sql
-- 问题：t_agent_checkpoint 表缺少必要列，导致 Agent Checkpoint 持久化全部失败
-- 根因：云端 Flyway 可能未执行 V202705141500，或执行时部分列添加失败
-- 修复：强制同步所有必要列，幂等写法（information_schema 判断，SET @s 动态 SQL 避免字符串字面量）
-- 注意：
--   - SET @s 动态 SQL 内禁止写字符串字面量的 DEFAULT 值（改用独立 UPDATE 回填）
--   - PREPARE 动态 SQL 内禁止写 DEFAULT NULL（MySQL 8.0 报错），MySQL 对可空列默认 NULL

-- 1. tenant_id (BIGINT NOT NULL, 默认 0，数值型不在字符串字面量风险中)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 AFTER id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. thread_id (VARCHAR, MySQL 默认 NULL，去掉 DEFAULT NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='thread_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN thread_id VARCHAR(128) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET thread_id = '' WHERE thread_id IS NULL;

-- 3. node_id (VARCHAR, MySQL 默认 NULL，去掉 DEFAULT NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_id VARCHAR(128) AFTER thread_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET node_id = '' WHERE node_id IS NULL;

-- 4. node_name (VARCHAR, MySQL 默认 NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_name');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_name VARCHAR(256) AFTER node_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. state_json (MEDIUMTEXT, MySQL 默认 NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='state_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN state_json MEDIUMTEXT AFTER node_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. metadata_json (TEXT, MySQL 默认 NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='metadata_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN metadata_json TEXT AFTER state_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. step_index (INT NOT NULL, 默认 0，数值型 OK)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='step_index');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN step_index INT NOT NULL DEFAULT 0 AFTER metadata_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. status (VARCHAR, MySQL 默认 NULL，ACTIVE 用 UPDATE 回填)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN status VARCHAR(32) AFTER step_index', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET status = 'ACTIVE' WHERE status IS NULL;

-- 9. created_at (DATETIME, CURRENT_TIMESTAMP 是函数不是字符串字面量，OK)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. 索引（information_schema 判断，不支持 IF NOT EXISTS）
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND INDEX_NAME='idx_acp_tenant_thread');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_agent_checkpoint ADD INDEX idx_acp_tenant_thread (tenant_id, thread_id)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND INDEX_NAME='idx_acp_thread_step');
SET @s_idx2 = IF(@idx2=0, 'ALTER TABLE t_agent_checkpoint ADD INDEX idx_acp_thread_step (thread_id, step_index)', 'SELECT 1');
PREPARE stmt FROM @s_idx2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND INDEX_NAME='idx_acp_status');
SET @s_idx3 = IF(@idx3=0, 'ALTER TABLE t_agent_checkpoint ADD INDEX idx_acp_status (status)', 'SELECT 1');
PREPARE stmt FROM @s_idx3; EXECUTE stmt; DEALLOCATE PREPARE stmt;
