SET @dbname = DATABASE();

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_kg_synonym');
SET @s1 = IF(@c1=0, 'CREATE TABLE t_kg_synonym (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, word VARCHAR(128) NOT NULL, canonical_entity VARCHAR(128) NOT NULL, entity_type VARCHAR(64), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE INDEX idx_kg_synonym_tenant_word (tenant_id, word), INDEX idx_kg_synonym_tenant_entity (tenant_id, canonical_entity)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_nl_query_log');
SET @s2 = IF(@c2=0, 'CREATE TABLE t_nl_query_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, user_id VARCHAR(64), question TEXT NOT NULL, detected_intent VARCHAR(64), confidence INT, handler_type VARCHAR(16), user_feedback VARCHAR(16), correct_intent VARCHAR(64), response_time_ms INT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_nlql_tenant_created (tenant_id, created_at), INDEX idx_nlql_tenant_intent (tenant_id, detected_intent)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
