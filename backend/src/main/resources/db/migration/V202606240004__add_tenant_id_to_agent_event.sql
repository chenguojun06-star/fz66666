-- ============================================================
-- V202606240004: 为 t_agent_event 添加 tenant_id 列
-- 原因：AI智能体事件记录需要多租户隔离，支持按租户查询和分析
-- 注意：表不存在时跳过
-- 幂等性：用 INFORMATION_SCHEMA 检查（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）
-- ============================================================

DROP PROCEDURE IF EXISTS add_tenant_id_to_agent_event;
DELIMITER //
CREATE PROCEDURE add_tenant_id_to_agent_event()
BEGIN
    DECLARE table_exists INT DEFAULT 0;
    DECLARE col_exists INT DEFAULT 0;
    DECLARE idx_exists INT DEFAULT 0;

    SELECT COUNT(*) INTO table_exists
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_agent_event';

    IF table_exists = 0 THEN
        SELECT 't_agent_event table not exists, skip' AS msg;
    ELSE
        SELECT COUNT(*) INTO col_exists
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_agent_event' AND COLUMN_NAME = 'tenant_id';

        IF col_exists = 0 THEN
            ALTER TABLE t_agent_event ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID' AFTER id;
        END IF;

        SELECT COUNT(*) INTO idx_exists
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_agent_event' AND INDEX_NAME = 'idx_tenant_session';

        IF idx_exists = 0 THEN
            ALTER TABLE t_agent_event ADD INDEX idx_tenant_session (tenant_id, session_id);
        END IF;
    END IF;
END //
DELIMITER ;
CALL add_tenant_id_to_agent_event();
DROP PROCEDURE IF EXISTS add_tenant_id_to_agent_event;
