-- V202606201005: 创建 t_shared_agent_memory 表（多 Agent 共享记忆）
--
-- 背景：
--   五层记忆模型设计文档第六章。
--   多个 Sub-Agent（扫码/质检/工资）共享"任务进度/发现的事实/团队决策"，
--   避免重复查询和事实冲突。
--
-- 用途：
--   - Sub-Agent 执行后写入发现的事实（如 order_status=DELAYED）
--   - Sub-Agent 执行前读取共享记忆，避免重复查询
--   - 按 session_id 隔离（同会话内共享，跨会话不共享）
--   - 会话结束 24h 后过期清理
--
-- 多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释

-- =============================================
-- 1. 创建 t_shared_agent_memory 表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shared_agent_memory');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_shared_agent_memory (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        agent_name VARCHAR(64) NOT NULL,
        fact_key VARCHAR(128) NOT NULL,
        fact_value TEXT NOT NULL,
        confidence DECIMAL(5,2) NOT NULL DEFAULT 0.80,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expire_time DATETIME NULL DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_session_fact (session_id, fact_key),
        KEY idx_tenant_session (tenant_id, session_id),
        KEY idx_expire (expire_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_shared_agent_memory COMMENT '多Agent共享记忆（同会话内共享，会话结束24h后过期）';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN session_id VARCHAR(64) NOT NULL COMMENT '会话ID（隔离边界，同会话内共享）';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN agent_name VARCHAR(64) NOT NULL COMMENT '写入的Agent：scan_agent/quality_agent/wage_agent';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN fact_key VARCHAR(128) NOT NULL COMMENT '事实键：order_status/quality_result/...';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN fact_value TEXT NOT NULL COMMENT '事实值JSON';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN confidence DECIMAL(5,2) NOT NULL DEFAULT 0.80 COMMENT '置信度0-100';
ALTER TABLE t_shared_agent_memory MODIFY COLUMN expire_time DATETIME NULL DEFAULT NULL COMMENT '过期时间（会话结束后24h）';
