-- ============================================================
-- 超级智能AI业务顾问 v3.23 — 会话 + 反馈 + 知识提炼 数据表
-- ============================================================

-- 1. 会话消息表：存储每轮对话的 user/assistant 消息（支持连续对话）
CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`    BIGINT       NOT NULL,
    `user_id`      VARCHAR(64)  NOT NULL COMMENT '发起用户ID',
    `session_id`   VARCHAR(64)  NOT NULL COMMENT '会话标识（前端生成）',
    `role`         VARCHAR(16)  NOT NULL COMMENT 'user / assistant / system',
    `content`      TEXT         NOT NULL COMMENT '消息正文',
    `metadata_json` TEXT        NULL     COMMENT '附加结构化数据（风险/图表/模拟结果JSON）',
    `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `delete_flag`  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `idx_session_lookup` (`tenant_id`, `session_id`, `delete_flag`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-对话消息';

-- 2. 顾问反馈表：用户对每条建议的评分 + 自动知识提炼标记
CREATE TABLE IF NOT EXISTS `t_advisor_feedback` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`       BIGINT       NOT NULL,
    `user_id`         VARCHAR(64)  NOT NULL,
    `session_id`      VARCHAR(64)  NOT NULL,
    `trace_id`        VARCHAR(64)  NULL     COMMENT 'Langfuse trace ID',
    `query_text`      TEXT         NOT NULL COMMENT '用户原始提问',
    `advice_text`     TEXT         NOT NULL COMMENT 'AI建议摘要',
    `score`           DOUBLE       NOT NULL DEFAULT 0 COMMENT '评分 0~1（1=好建议）',
    `feedback_text`   VARCHAR(500) NULL     COMMENT '用户文字反馈',
    `harvested`       TINYINT      NOT NULL DEFAULT 0 COMMENT '是否已提炼为知识库条目 0=未 1=已',
    `harvested_kb_id` VARCHAR(64)  NULL     COMMENT '提炼后写入 t_knowledge_base 的记录ID',
    `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_feedback_harvest` (`harvested`, `score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-反馈与知识提炼';
