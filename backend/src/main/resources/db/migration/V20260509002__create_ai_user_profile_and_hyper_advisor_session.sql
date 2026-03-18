-- Flyway V20260509002
-- 创建 t_ai_user_profile（AI用户画像）和 t_hyper_advisor_session（超级顾问会话记录）
-- 云端缺失这两张表导致 intelligence 模块持续 SQLSyntaxErrorException，本脚本修复

CREATE TABLE IF NOT EXISTS `t_ai_user_profile` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`        BIGINT       NOT NULL                COMMENT '租户ID',
    `user_id`          VARCHAR(64)  NOT NULL                COMMENT '用户ID',
    `behavior_summary` TEXT         DEFAULT NULL            COMMENT '行为摘要（AI生成）',
    `preferences_json` LONGTEXT     DEFAULT NULL            COMMENT '偏好JSON',
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`),
    KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像';

CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`     BIGINT       NOT NULL                COMMENT '租户ID',
    `user_id`       VARCHAR(64)  NOT NULL                COMMENT '用户ID',
    `session_id`    VARCHAR(128) NOT NULL                COMMENT '会话ID',
    `role`          VARCHAR(32)  DEFAULT NULL            COMMENT '消息角色（user/assistant/system）',
    `content`       LONGTEXT     DEFAULT NULL            COMMENT '消息内容',
    `metadata_json` TEXT         DEFAULT NULL            COMMENT '元数据JSON',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `delete_flag`   INT          NOT NULL DEFAULT 0      COMMENT '删除标记（0正常 1删除）',
    PRIMARY KEY (`id`),
    KEY `idx_session_id` (`session_id`),
    KEY `idx_tenant_user` (`tenant_id`, `user_id`),
    KEY `idx_tenant_create` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录';
