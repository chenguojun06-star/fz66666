-- AI 对话记忆：跨会话持久化（用户级，按 user_id 隔离）
CREATE TABLE IF NOT EXISTS t_ai_conversation_memory (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id            BIGINT       NOT NULL,
    user_id              VARCHAR(64)  NOT NULL,
    memory_summary       TEXT         NOT NULL,
    key_entities         TEXT         NULL     COMMENT '关注的订单号/款式/工厂 JSON',
    importance_score     INT          NOT NULL DEFAULT 50,
    source_message_count INT          NOT NULL DEFAULT 0,
    create_time          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expire_time          DATETIME     NULL,
    delete_flag          TINYINT      NOT NULL DEFAULT 0,
    INDEX idx_tenant_user (tenant_id, user_id),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话记忆-用户级跨会话持久化';
