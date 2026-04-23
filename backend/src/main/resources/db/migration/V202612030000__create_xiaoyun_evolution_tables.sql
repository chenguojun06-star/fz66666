CREATE TABLE IF NOT EXISTS t_xiaoyun_evolution_log (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY,
    category        VARCHAR(32)  NOT NULL COMMENT 'prompt/parameter/knowledge/github_research',
    description     TEXT         DEFAULT NULL,
    before_state    TEXT         DEFAULT NULL,
    after_state     TEXT         DEFAULT NULL,
    confidence      DECIMAL(5,2) DEFAULT 0,
    source          VARCHAR(64)  DEFAULT NULL COMMENT 'github_research/user_feedback/manual',
    status          VARCHAR(32)  NOT NULL DEFAULT 'PROPOSED' COMMENT 'PROPOSED/TESTED/APPROVED/DEPLOYED/ROLLED_BACK/RESEARCH',
    test_report     TEXT         DEFAULT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT NULL,
    INDEX idx_evo_status (status),
    INDEX idx_evo_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小云自进化日志表';

CREATE TABLE IF NOT EXISTS t_xiaoyun_prompt_version (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    proposal_id     VARCHAR(64)  NOT NULL,
    category        VARCHAR(32)  DEFAULT NULL,
    before_prompt   TEXT         DEFAULT NULL,
    after_prompt    TEXT         DEFAULT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'PENDING_REVIEW' COMMENT 'PENDING_REVIEW/APPROVED/REJECTED',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prompt_proposal (proposal_id),
    INDEX idx_prompt_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小云Prompt版本管理表';

CREATE TABLE IF NOT EXISTS t_xiaoyun_param_version (
    id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    proposal_id     VARCHAR(64)  NOT NULL,
    param_key       VARCHAR(128) DEFAULT NULL,
    before_value    TEXT         DEFAULT NULL,
    after_value     TEXT         DEFAULT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'PENDING_REVIEW' COMMENT 'PENDING_REVIEW/APPROVED/REJECTED',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_param_proposal (proposal_id),
    INDEX idx_param_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小云参数版本管理表';

ALTER TABLE t_ai_conversation_memory
    ADD COLUMN IF NOT EXISTS user_message    TEXT         DEFAULT NULL COMMENT '用户原始消息',
    ADD COLUMN IF NOT EXISTS ai_response     TEXT         DEFAULT NULL COMMENT 'AI原始回复',
    ADD COLUMN IF NOT EXISTS feedback_score  TINYINT      DEFAULT NULL COMMENT '用户反馈评分(1-5)',
    ADD COLUMN IF NOT EXISTS feedback_reason VARCHAR(500) DEFAULT NULL COMMENT '反馈原因';
