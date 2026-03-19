-- ============================================================
-- V20260510002 — 终局修复：确保三张 intelligence AI 表存在
-- 修复云端 t_hyper_advisor_session / t_agent_meeting / t_ai_user_profile 不存在
-- 导致 intelligence 模块所有 API 持续返回 SQLSyntaxErrorException（500）
-- 上游脚本 V20260318002 / V20260319002 / V20260509002 因 Flyway 版本序号问题
-- 未被云端真正执行，本脚本以最高版本号强制补全三张表
-- ============================================================

-- 1. t_agent_meeting（Agent例会·辩论+共识）
CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `meeting_type` VARCHAR(50) NOT NULL COMMENT '例会类型: daily_standup|risk_review|decision_debate|retrospective',
    `topic` VARCHAR(300) NOT NULL COMMENT '会议主题',
    `participants` VARCHAR(500) COMMENT '参与Agent列表(JSON数组)',
    `agenda` TEXT COMMENT '议程(JSON数组)',
    `debate_rounds` TEXT COMMENT '辩论轮次(JSON)',
    `consensus` TEXT COMMENT '最终共识',
    `dissent` TEXT COMMENT '保留意见',
    `action_items` TEXT COMMENT '决议行动项(JSON数组)',
    `confidence_score` INT COMMENT '共识置信度0-100',
    `linked_decision_ids` VARCHAR(500) COMMENT '关联决策记忆ID',
    `linked_rca_ids` VARCHAR(500) COMMENT '关联根因分析ID',
    `duration_ms` BIGINT COMMENT '会议耗时(毫秒)',
    `status` VARCHAR(20) DEFAULT 'concluded' COMMENT 'in_progress|concluded|actions_pending|all_done',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_am_tenant_type` (`tenant_id`, `meeting_type`),
    INDEX `idx_am_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会-辩论+共识';

-- 2. t_ai_user_profile（AI用户画像）
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

-- 3. t_hyper_advisor_session（超级顾问会话记录）
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
