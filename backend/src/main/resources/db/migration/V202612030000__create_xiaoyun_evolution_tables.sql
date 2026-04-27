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

-- user_message: 用户原始消息
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_conversation_memory' AND COLUMN_NAME='user_message')=0,'ALTER TABLE t_ai_conversation_memory ADD COLUMN user_message TEXT DEFAULT NULL','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ai_response: AI原始回复
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_conversation_memory' AND COLUMN_NAME='ai_response')=0,'ALTER TABLE t_ai_conversation_memory ADD COLUMN ai_response TEXT DEFAULT NULL','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- feedback_score: 用户反馈评分(1-5)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_conversation_memory' AND COLUMN_NAME='feedback_score')=0,'ALTER TABLE t_ai_conversation_memory ADD COLUMN feedback_score TINYINT DEFAULT NULL','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- feedback_reason: 反馈原因
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ai_conversation_memory' AND COLUMN_NAME='feedback_reason')=0,'ALTER TABLE t_ai_conversation_memory ADD COLUMN feedback_reason VARCHAR(500) DEFAULT NULL','SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
