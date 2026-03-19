-- ============================================================
-- V202603191000 — 热修复：补齐超级顾问核心表
-- 修复线上 t_hyper_advisor_session 缺失导致 /api/hyper-advisor/* 持续 SQLSyntaxErrorException
-- 说明：原始建表脚本虽已存在，但云端存在漏跑/缺表环境，因此补一条当前时间线热修脚本兜底
-- ============================================================

CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
    `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
    `session_id` VARCHAR(128) NOT NULL COMMENT '会话ID',
    `role` VARCHAR(32) DEFAULT NULL COMMENT '消息角色（user/assistant/system）',
    `content` LONGTEXT DEFAULT NULL COMMENT '消息内容',
    `metadata_json` TEXT DEFAULT NULL COMMENT '元数据JSON',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标记（0正常 1删除）',
    PRIMARY KEY (`id`),
    KEY `idx_session_id` (`session_id`),
    KEY `idx_tenant_user` (`tenant_id`, `user_id`),
    KEY `idx_tenant_create` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录';

CREATE TABLE IF NOT EXISTS `t_advisor_feedback` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenant_id` BIGINT NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `trace_id` VARCHAR(64) DEFAULT NULL COMMENT 'Langfuse trace ID',
    `query_text` TEXT NOT NULL COMMENT '用户原始提问',
    `advice_text` TEXT NOT NULL COMMENT 'AI建议摘要',
    `score` DOUBLE NOT NULL DEFAULT 0 COMMENT '评分 0~1（1=好建议）',
    `feedback_text` VARCHAR(500) DEFAULT NULL COMMENT '用户文字反馈',
    `harvested` TINYINT NOT NULL DEFAULT 0 COMMENT '是否已提炼为知识库条目 0=未 1=已',
    `harvested_kb_id` VARCHAR(64) DEFAULT NULL COMMENT '提炼后写入 t_knowledge_base 的记录ID',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_feedback_harvest` (`harvested`, `score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-反馈与知识提炼';

CREATE TABLE IF NOT EXISTS `t_ai_user_profile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
    `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
    `behavior_summary` TEXT DEFAULT NULL COMMENT '行为摘要（AI生成）',
    `preferences_json` LONGTEXT DEFAULT NULL COMMENT '偏好JSON',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`),
    KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像';
