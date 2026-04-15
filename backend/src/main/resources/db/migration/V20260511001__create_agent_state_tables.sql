SET @dbname = DATABASE();

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_session');
SET @s1 = IF(@c1=0, 'CREATE TABLE t_agent_session (id VARCHAR(36) PRIMARY KEY, tenant_id BIGINT DEFAULT 0, user_id VARCHAR(64), status VARCHAR(20) DEFAULT ''running'', user_message TEXT, final_answer TEXT, total_tokens INT DEFAULT 0, total_iterations INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_as_tenant_user(tenant_id, user_id), INDEX idx_as_status(status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint');
SET @s2 = IF(@c2=0, 'CREATE TABLE t_agent_checkpoint (id BIGINT AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(36) NOT NULL, iteration INT NOT NULL, messages_json MEDIUMTEXT, tool_calls_json MEDIUMTEXT, total_tokens INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_ac_session_iter(session_id, iteration), FOREIGN KEY (session_id) REFERENCES t_agent_session(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @c3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_event');
SET @s3 = IF(@c3=0, 'CREATE TABLE t_agent_event (id BIGINT AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(36) NOT NULL, iteration INT DEFAULT 0, event_type VARCHAR(32) NOT NULL, event_data_json MEDIUMTEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_ae_session(session_id), FOREIGN KEY (session_id) REFERENCES t_agent_session(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;
