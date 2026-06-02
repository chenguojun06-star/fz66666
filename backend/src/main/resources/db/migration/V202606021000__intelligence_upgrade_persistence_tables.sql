-- ============================================================
-- 智能化核心升级 - 持久化基础设施
-- 创建时间：2026-06-02
-- 涉及：t_intent_composition_template / t_kg_snapshot /
--      t_prompt_variant / t_risk_detection_result /
--      t_push_timing / t_dag_execution_log / t_cross_session_learning /
--      t_intent_composition_hit
--
-- 设计原则：
-- 1. 全部使用 IF NOT EXISTS 模式，幂等可重入
-- 2. tenant_id 必填 + 复合索引，遵循多租户隔离
-- 3. delete_flag 软删除 + create_time/update_time 审计字段
-- 4. 字段注释完整（COLLATE utf8mb4_unicode_ci）
-- 5. 不破坏已有数据
-- ============================================================

SET @dbname = DATABASE();

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intent_composition_template');
SET @s1 = IF(@c1=0, 'CREATE TABLE t_intent_composition_template (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, template_name VARCHAR(128) NOT NULL, trigger_pattern TEXT NOT NULL, intent_sequence TEXT NOT NULL, composition_strategy VARCHAR(32) NOT NULL DEFAULT ''sequential'', priority INT NOT NULL DEFAULT 50, enabled TINYINT(1) NOT NULL DEFAULT 1, hit_count BIGINT NOT NULL DEFAULT 0, last_hit_at DATETIME, description VARCHAR(512), delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_ict_tenant_enabled (tenant_id, enabled, delete_flag), INDEX idx_ict_priority (tenant_id, priority)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''意图组合模板表''', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_kg_snapshot');
SET @s2 = IF(@c2=0, 'CREATE TABLE t_kg_snapshot (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, snapshot_version VARCHAR(32) NOT NULL, relation_type VARCHAR(32) NOT NULL, relation_count INT NOT NULL DEFAULT 0, payload MEDIUMTEXT NOT NULL, payload_size INT NOT NULL DEFAULT 0, build_source VARCHAR(64) NOT NULL DEFAULT ''full'', build_duration_ms INT, delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uk_kg_tenant_version_type (tenant_id, snapshot_version, relation_type), INDEX idx_kg_tenant_type (tenant_id, relation_type, delete_flag)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''知识图谱快照表''', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @c3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_prompt_variant');
SET @s3 = IF(@c3=0, 'CREATE TABLE t_prompt_variant (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, intent VARCHAR(128) NOT NULL, variant_name VARCHAR(128) NOT NULL, content MEDIUMTEXT NOT NULL, variant_type VARCHAR(32) NOT NULL DEFAULT ''experiment'', traffic_weight INT NOT NULL DEFAULT 50, status VARCHAR(16) NOT NULL DEFAULT ''active'', hit_count BIGINT NOT NULL DEFAULT 0, total_score DOUBLE NOT NULL DEFAULT 0, avg_score DOUBLE NOT NULL DEFAULT 0, last_evaluated_at DATETIME, parent_variant_id BIGINT, evolve_round INT NOT NULL DEFAULT 0, description VARCHAR(512), delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_pv_tenant_intent_status (tenant_id, intent, status, delete_flag), INDEX idx_pv_score (tenant_id, avg_score)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''Prompt变体表''', 'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @c4 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_risk_detection_result');
SET @s4 = IF(@c4=0, 'CREATE TABLE t_risk_detection_result (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, risk_type VARCHAR(32) NOT NULL, target_type VARCHAR(32) NOT NULL, target_id VARCHAR(64) NOT NULL, target_name VARCHAR(256), risk_level VARCHAR(16) NOT NULL, risk_score INT NOT NULL DEFAULT 0, risk_reason VARCHAR(512), recommended_action VARCHAR(512), status VARCHAR(16) NOT NULL DEFAULT ''open'', detector_name VARCHAR(64) NOT NULL, confidence DOUBLE NOT NULL DEFAULT 0, related_data TEXT, detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME, delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_rdr_tenant_type_status (tenant_id, risk_type, status, delete_flag), INDEX idx_rdr_target (tenant_id, target_type, target_id), INDEX idx_rdr_detected (tenant_id, detected_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''风险检测结果表''', 'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @c5 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_push_timing');
SET @s5 = IF(@c5=0, 'CREATE TABLE t_push_timing (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, user_id VARCHAR(64) NOT NULL, push_type VARCHAR(32) NOT NULL, preferred_hour INT NOT NULL DEFAULT 9, preferred_minute INT NOT NULL DEFAULT 0, weekday_mask INT NOT NULL DEFAULT 127, quiet_hours_start INT, quiet_hours_end INT, last_push_at DATETIME, push_count INT NOT NULL DEFAULT 0, open_count INT NOT NULL DEFAULT 0, open_rate DOUBLE NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_pt_tenant_user (tenant_id, user_id, push_type, delete_flag)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''推送时机优化表''', 'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

SET @c6 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_dag_execution_log');
SET @s6 = IF(@c6=0, 'CREATE TABLE t_dag_execution_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, thread_id VARCHAR(64) NOT NULL, user_id VARCHAR(64), session_id VARCHAR(64), query_text TEXT, intent VARCHAR(64), node_count INT NOT NULL DEFAULT 0, executed_nodes TEXT, failed_nodes TEXT, duration_ms INT NOT NULL DEFAULT 0, success TINYINT(1) NOT NULL DEFAULT 0, error_message VARCHAR(1024), final_state MEDIUMTEXT, delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_del_tenant_thread (tenant_id, thread_id, delete_flag), INDEX idx_del_tenant_intent (tenant_id, intent, create_time)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''DAG执行历史日志表''', 'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

SET @c7 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_cross_session_learning');
SET @s7 = IF(@c7=0, 'CREATE TABLE t_cross_session_learning (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, user_id VARCHAR(64) NOT NULL, learning_key VARCHAR(128) NOT NULL, learning_value TEXT NOT NULL, learning_type VARCHAR(32) NOT NULL DEFAULT ''preference'', source_session_id VARCHAR(64), confidence DOUBLE NOT NULL DEFAULT 0.5, hit_count INT NOT NULL DEFAULT 0, last_used_at DATETIME, status VARCHAR(16) NOT NULL DEFAULT ''active'', delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uk_csl_tenant_user_key (tenant_id, user_id, learning_key, learning_type), INDEX idx_csl_tenant_user (tenant_id, user_id, status, delete_flag)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''跨会话学习表''', 'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

SET @c8 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intent_composition_hit');
SET @s8 = IF(@c8=0, 'CREATE TABLE t_intent_composition_hit (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id BIGINT NOT NULL, template_id BIGINT NOT NULL, template_name VARCHAR(128) NOT NULL, user_id VARCHAR(64), query_text TEXT, intent_sequence TEXT, success TINYINT(1) NOT NULL DEFAULT 1, user_satisfaction DOUBLE, delete_flag TINYINT(1) NOT NULL DEFAULT 0, create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_ich_tenant_template (tenant_id, template_id, create_time), INDEX idx_ich_tenant_success (tenant_id, success, create_time)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''意图组合模板命中记录表''', 'SELECT 1');
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;
