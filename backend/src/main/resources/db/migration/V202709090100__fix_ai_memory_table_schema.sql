-- V202709090100__fix_ai_memory_table_schema.sql
-- 问题：小云 AI 模块三张核心表（t_agent_checkpoint / t_decision_memory / t_kg_entity）
--       在云端多次出现列缺失/类型不匹配，导致 AgentCheckpoint/DecisionMemory insert 全部失败、
--       KgEntityMapper.searchEntities 报 SQL 语法错误，日志刷屏。
-- 根因：云端 Flyway 执行环境与本地不一致，部分 ADD COLUMN 未生效（历史已有两轮同款修复：
--       V202705031800 / V20270620001，说明该类漂移会复发）。
-- 修复：按 V20270620001 范式做第三轮强制同步——information_schema 判断 + SET @s 动态 SQL，
--       全部幂等；并将 state_json 从 MEDIUMTEXT 升级为 LONGTEXT，消除 4M 字符截断的边界风险。
-- 注意：
--   - SET @s 动态 SQL 内禁止字符串字面量 DEFAULT（改独立 UPDATE 回填或省略）
--   - PREPARE 动态 SQL 内禁止 DEFAULT NULL（MySQL 8.0 报错），可空列默认即 NULL
--   - 数值型 DEFAULT 0 与 DATETIME DEFAULT CURRENT_TIMESTAMP 不受限制

-- ═══════════════ 一、t_agent_checkpoint ═══════════════

-- 1. tenant_id (BIGINT NOT NULL DEFAULT 0)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 AFTER id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. thread_id (VARCHAR(128))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='thread_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN thread_id VARCHAR(128) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET thread_id = '' WHERE thread_id IS NULL;

-- 3. node_id (VARCHAR(128))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_id VARCHAR(128) AFTER thread_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET node_id = '' WHERE node_id IS NULL;

-- 4. node_name (VARCHAR(256))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_name');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_name VARCHAR(256) AFTER node_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. state_json (MEDIUMTEXT → 若仍为 MEDIUMTEXT 则升级为 LONGTEXT，消除 4M 字符边界风险)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='state_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN state_json LONGTEXT AFTER node_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='state_json' AND DATA_TYPE='mediumtext');
SET @s2 = IF(@c2>0, 'ALTER TABLE t_agent_checkpoint MODIFY COLUMN state_json LONGTEXT', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 6. metadata_json (TEXT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='metadata_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN metadata_json TEXT AFTER state_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. step_index (INT NOT NULL DEFAULT 0)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='step_index');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN step_index INT NOT NULL DEFAULT 0 AFTER metadata_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. status (VARCHAR(32)，ACTIVE 用 UPDATE 回填)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN status VARCHAR(32) AFTER step_index', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET status = 'ACTIVE' WHERE status IS NULL;

-- 9. created_at (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. 索引（幂等）
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND INDEX_NAME='idx_acp_tenant_thread');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_agent_checkpoint ADD INDEX idx_acp_tenant_thread (tenant_id, thread_id)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═══════════════ 二、t_decision_memory ═══════════════

-- 1. tenant_id (BIGINT NOT NULL)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 AFTER id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. decision_type (VARCHAR(50))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='decision_type');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN decision_type VARCHAR(50) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. scene (VARCHAR(100))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='scene');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN scene VARCHAR(100) AFTER decision_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. context_snapshot (TEXT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='context_snapshot');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN context_snapshot TEXT AFTER scene', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. decision_content (TEXT NOT NULL，空串回填)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='decision_content');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN decision_content TEXT NOT NULL AFTER context_snapshot', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_decision_memory SET decision_content = ' ' WHERE decision_content IS NULL OR decision_content = '';

-- 6. rationale (TEXT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='rationale');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN rationale TEXT AFTER decision_content', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. expected_outcome (VARCHAR(500))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='expected_outcome');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN expected_outcome VARCHAR(500) AFTER rationale', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. actual_outcome (VARCHAR(500))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='actual_outcome');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN actual_outcome VARCHAR(500) AFTER expected_outcome', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. outcome_score (INT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='outcome_score');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN outcome_score INT AFTER actual_outcome', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. lesson_learned (TEXT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='lesson_learned');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN lesson_learned TEXT AFTER outcome_score', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11. linked_order_ids (VARCHAR(2000))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='linked_order_ids');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN linked_order_ids VARCHAR(2000) AFTER lesson_learned', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12. agent_source (VARCHAR(50))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='agent_source');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN agent_source VARCHAR(50) AFTER linked_order_ids', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 13. execution_id (VARCHAR(64))
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='execution_id');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN execution_id VARCHAR(64) AFTER agent_source', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 14. confidence_at_decision (INT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='confidence_at_decision');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN confidence_at_decision INT AFTER execution_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 15. confidence_after_outcome (INT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='confidence_after_outcome');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN confidence_after_outcome INT AFTER confidence_at_decision', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 16. status (VARCHAR(20)，pending 用 UPDATE 回填)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN status VARCHAR(20) AFTER confidence_after_outcome', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_decision_memory SET status = 'pending' WHERE status IS NULL;

-- 17. delete_flag (INT)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='delete_flag');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN delete_flag INT AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 18. create_time / update_time (DATETIME DEFAULT CURRENT_TIMESTAMP)
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='create_time');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP AFTER delete_flag', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND COLUMN_NAME='update_time');
SET @s = IF(@c=0, 'ALTER TABLE t_decision_memory ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER create_time', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 19. 索引（幂等）
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_decision_memory' AND INDEX_NAME='idx_dm_tenant_type');
SET @s_idx = IF(@idx=0, 'ALTER TABLE t_decision_memory ADD INDEX idx_dm_tenant_type (tenant_id, decision_type)', 'SELECT 1');
PREPARE stmt FROM @s_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═══════════════ 三、t_kg_entity / t_kg_relation ═══════════════

-- t_kg_entity 列同步
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN tenant_id BIGINT DEFAULT 0 AFTER id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='entity_type');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN entity_type VARCHAR(64) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='entity_name');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN entity_name VARCHAR(255) AFTER entity_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='external_id');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN external_id VARCHAR(64) AFTER entity_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='properties_json');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN properties_json TEXT AFTER external_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='delete_flag');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN delete_flag INT AFTER properties_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER delete_flag', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_entity' AND COLUMN_NAME='updated_at');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_entity ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_kg_relation 列同步（traverseGraph JOIN 依赖）
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN tenant_id BIGINT DEFAULT 0 AFTER id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='source_id');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN source_id BIGINT AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='target_id');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN target_id BIGINT AFTER source_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='relation_type');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN relation_type VARCHAR(64) AFTER target_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='weight');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN weight DOUBLE DEFAULT 1.0 AFTER relation_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_kg_relation' AND COLUMN_NAME='delete_flag');
SET @s = IF(@c=0, 'ALTER TABLE t_kg_relation ADD COLUMN delete_flag INT AFTER weight', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
