SET @dbname = DATABASE();

SET @col_check = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='thread_id');
SET @alter_sql = IF(@col_check=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN thread_id VARCHAR(128) NOT NULL DEFAULT '''' AFTER tenant_id, ADD COLUMN node_id VARCHAR(128) NOT NULL DEFAULT '''' AFTER thread_id, ADD COLUMN node_name VARCHAR(256) AFTER node_id, ADD COLUMN state_json MEDIUMTEXT AFTER node_name, ADD COLUMN metadata_json TEXT AFTER state_json, ADD COLUMN step_index INT NOT NULL DEFAULT 0 AFTER metadata_json, ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''ACTIVE'' AFTER step_index, ADD INDEX idx_acp_tenant_thread (tenant_id, thread_id), ADD INDEX idx_acp_thread_step (thread_id, step_index), ADD INDEX idx_acp_status (status)', 'SELECT 1');
PREPARE stmt FROM @alter_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_check2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='session_id');
SET @drop_sql = IF(@col_check2>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN session_id, DROP COLUMN iteration, DROP COLUMN messages_json, DROP COLUMN tool_calls_json, DROP COLUMN total_tokens, DROP INDEX idx_ac_session_iter, DROP FOREIGN KEY t_agent_checkpoint_ibfk_1', 'SELECT 1');
PREPARE stmt2 FROM @drop_sql; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_core');
SET @s1 = IF(@c1=0, 'CREATE TABLE t_agent_memory_core (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id VARCHAR(128) NOT NULL, memory_key VARCHAR(256) NOT NULL, memory_value TEXT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX idx_amc_tenant_agent_key (tenant_id, agent_id, memory_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE stmt3 FROM @s1; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival');
SET @s2 = IF(@c2=0, 'CREATE TABLE t_agent_memory_archival (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id VARCHAR(128) NOT NULL, content TEXT NOT NULL, content_type VARCHAR(64) NOT NULL DEFAULT ''lesson'', access_count INT NOT NULL DEFAULT 0, last_accessed_at DATETIME, decay_weight DOUBLE NOT NULL DEFAULT 1.0, embedding_id VARCHAR(256), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_ama_tenant_agent (tenant_id, agent_id), INDEX idx_ama_tenant_type (tenant_id, content_type), INDEX idx_ama_decay (decay_weight)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE stmt4 FROM @s2; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @c3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_card');
SET @s3 = IF(@c3=0, 'CREATE TABLE t_agent_card (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, agent_id VARCHAR(128) NOT NULL, agent_name VARCHAR(256) NOT NULL, description TEXT, skills_json TEXT, input_types_json TEXT, output_types_json TEXT, endpoint_url VARCHAR(512), protocol VARCHAR(32) NOT NULL DEFAULT ''A2A'', status VARCHAR(32) NOT NULL DEFAULT ''ACTIVE'', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX idx_agc_tenant_agent (tenant_id, agent_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE stmt5 FROM @s3; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;
