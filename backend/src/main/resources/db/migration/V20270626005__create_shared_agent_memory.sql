-- ============================================================
-- V20270626005：多 Agent 共享记忆表（t_shared_agent_memory）
-- 目的：多个 Sub-Agent 共享"任务进度/发现事实/团队决策"
-- 关联：五层记忆模型设计文档（five-layer-memory-design.md）
-- P0 铁律 #4：tenant_id 必填 + 按 session_id 隔离
-- ============================================================

CREATE TABLE IF NOT EXISTS t_shared_agent_memory (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）',
    session_id VARCHAR(64) NOT NULL COMMENT '会话ID（隔离边界）',
    agent_name VARCHAR(64) NOT NULL COMMENT 'scan_agent/quality_agent/wage_agent/delivery_agent',
    fact_key VARCHAR(128) NOT NULL COMMENT '事实键：order_status/quality_result/...',
    fact_value TEXT NOT NULL COMMENT '事实值JSON',
    confidence DECIMAL(5,2) DEFAULT 0.80 COMMENT '置信度0-100',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    expire_time DATETIME COMMENT '会话结束后24h过期',
    UNIQUE KEY uk_session_fact (session_id, fact_key),
    KEY idx_tenant_session (tenant_id, session_id),
    KEY idx_expire (expire_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='多Agent共享记忆（同会话内共享）';
