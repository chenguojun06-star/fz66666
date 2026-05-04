SET @dbname = DATABASE();

-- ============================================================
-- 策略：CREATE TABLE 直接走 IF NOT EXISTS（不用 SET @s）
--       ADD/DROP COLUMN 走 SET @s + PREPARE，但移除所有 DEFAULT NULL
--       需要空字符串默认值的列拆分为 ADD + UPDATE backfill
--       所有检查优先用 INFORMATION_SCHEMA.COLUMNS，保证幂等
-- ============================================================

-- ============================================================
-- 1. t_agent_memory_archival
-- ============================================================
CREATE TABLE IF NOT EXISTS t_agent_memory_archival (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    agent_id VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(64),
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decay_weight DOUBLE NOT NULL DEFAULT 1.0,
    embedding_id VARCHAR(256),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ama_tenant_agent (tenant_id, agent_id),
    INDEX idx_ama_tenant_type (tenant_id, content_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='agent_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_memory_archival ADD COLUMN agent_id VARCHAR(128) NOT NULL AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='content_type');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_memory_archival ADD COLUMN content_type VARCHAR(64) AFTER content', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='access_count');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_memory_archival ADD COLUMN access_count INT NOT NULL DEFAULT 0 AFTER content_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='decay_weight');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_memory_archival ADD COLUMN decay_weight DOUBLE NOT NULL DEFAULT 1.0 AFTER last_accessed_at', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='embedding_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_memory_archival ADD COLUMN embedding_id VARCHAR(256) AFTER decay_weight', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='session_id');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_memory_archival DROP COLUMN session_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='summary');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_memory_archival DROP COLUMN summary', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='category');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_memory_archival DROP COLUMN category', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='importance');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_memory_archival DROP COLUMN importance', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_memory_archival' AND COLUMN_NAME='weight');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_memory_archival DROP COLUMN weight', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. t_agent_checkpoint
-- ============================================================
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 FIRST', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='thread_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN thread_id VARCHAR(128) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET thread_id = '' WHERE thread_id IS NULL;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_id');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_id VARCHAR(128) AFTER thread_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET node_id = '' WHERE node_id IS NULL;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='node_name');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN node_name VARCHAR(256) AFTER node_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='state_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN state_json MEDIUMTEXT AFTER node_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='metadata_json');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN metadata_json TEXT AFTER state_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='step_index');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN step_index INT NOT NULL DEFAULT 0 AFTER metadata_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN status VARCHAR(32) AFTER step_index', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE t_agent_checkpoint SET status = 'ACTIVE' WHERE status IS NULL;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_agent_checkpoint ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND CONSTRAINT_NAME='t_agent_checkpoint_ibfk_1' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP FOREIGN KEY t_agent_checkpoint_ibfk_1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='session_id');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN session_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='iteration');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN iteration', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='messages_json');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN messages_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='tool_calls_json');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN tool_calls_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='total_tokens');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN total_tokens', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. t_scan_precheck_feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS t_scan_precheck_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    order_no VARCHAR(64),
    scan_type VARCHAR(32),
    precheck_issues JSON,
    user_action VARCHAR(16) NOT NULL,
    user_remark VARCHAR(512),
    operator_id BIGINT,
    operator_name VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_spf_tenant_order (tenant_id, order_no),
    INDEX idx_spf_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_scan_precheck_feedback' AND COLUMN_NAME='scan_type');
SET @s = IF(@c=0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN scan_type VARCHAR(32) AFTER order_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_scan_precheck_feedback' AND COLUMN_NAME='precheck_issues');
SET @s = IF(@c=0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN precheck_issues JSON AFTER scan_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_scan_precheck_feedback' AND COLUMN_NAME='user_remark');
SET @s = IF(@c=0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN user_remark VARCHAR(512) AFTER user_action', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_scan_precheck_feedback' AND COLUMN_NAME='operator_id');
SET @s = IF(@c=0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN operator_id BIGINT AFTER user_remark', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_scan_precheck_feedback' AND COLUMN_NAME='operator_name');
SET @s = IF(@c=0, 'ALTER TABLE t_scan_precheck_feedback ADD COLUMN operator_name VARCHAR(64) AFTER operator_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. t_sys_notice
-- ============================================================
CREATE TABLE IF NOT EXISTS t_sys_notice (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    to_name VARCHAR(64),
    from_name VARCHAR(64),
    order_no VARCHAR(64),
    title VARCHAR(128) NOT NULL,
    content TEXT,
    notice_type VARCHAR(32),
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_sn_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='to_name');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN to_name VARCHAR(64) AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='from_name');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN from_name VARCHAR(64) AFTER to_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='order_no');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN order_no VARCHAR(64) AFTER from_name', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='title');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN title VARCHAR(128) NOT NULL AFTER order_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='content');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN content TEXT AFTER title', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='notice_type');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN notice_type VARCHAR(32) AFTER content', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='is_read');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0 AFTER notice_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='created_at');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_read', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. t_intelligence_metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS t_intelligence_metrics (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    scene VARCHAR(100) NOT NULL,
    provider VARCHAR(50),
    model VARCHAR(100),
    trace_id VARCHAR(64),
    trace_url VARCHAR(500),
    success TINYINT(1) NOT NULL DEFAULT 0,
    fallback_used TINYINT(1) NOT NULL DEFAULT 0,
    latency_ms INT,
    prompt_chars INT,
    response_chars INT,
    tool_call_count INT,
    prompt_tokens INT,
    completion_tokens INT,
    error_message TEXT,
    user_id VARCHAR(64),
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delete_flag TINYINT(1) NOT NULL DEFAULT 0,
    user_feedback TEXT,
    feedback_score SMALLINT DEFAULT 0,
    command_id VARCHAR(64),
    PRIMARY KEY (id),
    KEY idx_metrics_tenant_scene (tenant_id, scene, create_time),
    KEY idx_metrics_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='prompt_tokens');
SET @s = IF(@c=0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN prompt_tokens INT AFTER tool_call_count', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='completion_tokens');
SET @s = IF(@c=0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN completion_tokens INT AFTER prompt_tokens', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='user_feedback');
SET @s = IF(@c=0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN user_feedback TEXT AFTER delete_flag', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='feedback_score');
SET @s = IF(@c=0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN feedback_score SMALLINT DEFAULT 0 AFTER user_feedback', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='command_id');
SET @s = IF(@c=0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN command_id VARCHAR(64) AFTER feedback_score', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. t_tenant_smart_feature (my-menus 端点依赖)
-- ============================================================
CREATE TABLE IF NOT EXISTS t_tenant_smart_feature (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    feature_key VARCHAR(100) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    remark VARCHAR(255),
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_tenant_feature_key (tenant_id, feature_key),
    KEY idx_tsf_tenant_id (tenant_id),
    KEY idx_tsf_feature_key (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_tenant_smart_feature' AND COLUMN_NAME='delete_flag');
SET @s = IF(@c=0, 'ALTER TABLE t_tenant_smart_feature ADD COLUMN delete_flag INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
