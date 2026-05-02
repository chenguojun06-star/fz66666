CREATE TABLE IF NOT EXISTS t_intelligence_high_risk_audit (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT DEFAULT NULL,
    user_id VARCHAR(64) DEFAULT NULL,
    user_name VARCHAR(64) DEFAULT NULL,
    tool_name VARCHAR(64) NOT NULL,
    args_hash CHAR(64) NOT NULL,
    args_preview VARCHAR(500) DEFAULT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME DEFAULT NULL,
    executed_at DATETIME DEFAULT NULL,
    elapsed_ms BIGINT DEFAULT NULL,
    success TINYINT(1) DEFAULT NULL,
    result_preview VARCHAR(500) DEFAULT NULL,
    error_message VARCHAR(500) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_ihra_tenant_tool (tenant_id, tool_name),
    KEY idx_ihra_args_hash (args_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS t_high_risk_audit_log;

SET @dbname = DATABASE();

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_agent_execution_log' AND column_name = 'specialist_results');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_agent_execution_log ADD COLUMN specialist_results TEXT DEFAULT NULL AFTER latency_ms', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_agent_execution_log' AND column_name = 'node_trace');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_agent_execution_log ADD COLUMN node_trace TEXT DEFAULT NULL AFTER specialist_results', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_agent_execution_log' AND column_name = 'digital_twin_snapshot');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_agent_execution_log ADD COLUMN digital_twin_snapshot TEXT DEFAULT NULL AFTER node_trace', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_agent_execution_log' AND column_name = 'user_feedback');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_agent_execution_log ADD COLUMN user_feedback INT DEFAULT NULL AFTER digital_twin_snapshot', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_agent_execution_log' AND column_name = 'feedback_note');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_agent_execution_log ADD COLUMN feedback_note VARCHAR(500) DEFAULT NULL AFTER user_feedback', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_intelligence_metrics' AND column_name = 'user_feedback');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN user_feedback TEXT DEFAULT NULL AFTER completion_tokens', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_intelligence_metrics' AND column_name = 'feedback_score');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN feedback_score SMALLINT DEFAULT 0 AFTER user_feedback', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_intelligence_metrics' AND column_name = 'command_id');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_intelligence_metrics ADD COLUMN command_id VARCHAR(64) DEFAULT NULL AFTER feedback_score', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = @dbname AND table_name = 't_ai_conversation_memory' AND column_name = 'feedback_reason');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_ai_conversation_memory ADD COLUMN feedback_reason VARCHAR(500) DEFAULT NULL AFTER feedback_score', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
