SET @dbname = DATABASE();

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_kg_entity');
SET @s1 = IF(@c1=0, 'CREATE TABLE t_kg_entity (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT DEFAULT 0, entity_type VARCHAR(64) NOT NULL, entity_name VARCHAR(255) NOT NULL, external_id VARCHAR(64), properties_json TEXT, delete_flag INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_kge_tenant_type(tenant_id, entity_type), INDEX idx_kge_external(external_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_kg_relation');
SET @s2 = IF(@c2=0, 'CREATE TABLE t_kg_relation (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT DEFAULT 0, source_id BIGINT NOT NULL, target_id BIGINT NOT NULL, relation_type VARCHAR(64) NOT NULL, weight DOUBLE DEFAULT 1.0, properties_json TEXT, delete_flag INT DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_kgr_tenant_type(tenant_id, relation_type), INDEX idx_kgr_source(source_id), INDEX idx_kgr_target(target_id), FOREIGN KEY (source_id) REFERENCES t_kg_entity(id) ON DELETE CASCADE, FOREIGN KEY (target_id) REFERENCES t_kg_entity(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
