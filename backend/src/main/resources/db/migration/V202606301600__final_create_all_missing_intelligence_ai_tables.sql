-- ============================================================
-- V202606301600 — 终局修复（最高版本号，确保最后执行）
-- 修复云端持续报错的4张 intelligence AI 表缺失问题：
--   t_agent_meeting、t_ai_user_profile、t_hyper_advisor_session、t_advisor_feedback
--
-- 历史失败原因：
--   V20260318002 / V20260319002 — outOfOrder 被 Flyway 跳过（加入时云端已执行更高版本）
--   V20260509002 / V20260510002 / V202605101200 — 遗漏了 t_advisor_feedback
--
-- 本脚本策略：
--   全部使用 CREATE TABLE IF NOT EXISTS，完全幂等，重复执行安全
--   版本号 202606301600 > 所有现有脚本（202605101200），保证最后执行
-- ============================================================

-- 1. t_agent_meeting（Agent例会：辩论 + 共识 + 行动项）
CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
    `id`                  BIGINT       NOT NULL AUTO_INCREMENT           COMMENT '主键',
    `tenant_id`           BIGINT       NOT NULL                          COMMENT '租户ID',
    `meeting_type`        VARCHAR(50)  DEFAULT NULL                      COMMENT '例会类型: daily_standup|risk_review|decision_debate|retrospective',
    `topic`               VARCHAR(300) DEFAULT NULL                      COMMENT '会议主题',
    `participants`        TEXT         DEFAULT NULL                      COMMENT '参与Agent列表（JSON数组）',
    `agenda`              TEXT         DEFAULT NULL                      COMMENT '议程（JSON数组）',
    `debate_rounds`       TEXT         DEFAULT NULL                      COMMENT '辩论轮次（JSON）',
    `consensus`           TEXT         DEFAULT NULL                      COMMENT '最终共识',
    `dissent`             TEXT         DEFAULT NULL                      COMMENT '保留意见',
    `action_items`        TEXT         DEFAULT NULL                      COMMENT '决议行动项（JSON数组）',
    `confidence_score`    INT          DEFAULT NULL                      COMMENT '共识置信度 0-100',
    `linked_decision_ids` VARCHAR(500) DEFAULT NULL                      COMMENT '关联决策记忆ID',
    `linked_rca_ids`      VARCHAR(500) DEFAULT NULL                      COMMENT '关联根因分析ID',
    `duration_ms`         BIGINT       DEFAULT NULL                      COMMENT '会议耗时（毫秒）',
    `status`              VARCHAR(20)  DEFAULT 'concluded'               COMMENT 'in_progress|concluded|actions_pending|all_done',
    `delete_flag`         INT          NOT NULL DEFAULT 0                COMMENT '删除标记（0正常 1删除）',
    `create_time`         DATETIME     DEFAULT CURRENT_TIMESTAMP         COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_am_tenant_type`  (`tenant_id`, `meeting_type`),
    KEY `idx_am_create_time`  (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会-辩论+共识';

-- 2. t_ai_user_profile（AI用户画像：行为摘要 + 偏好）
CREATE TABLE IF NOT EXISTS `t_ai_user_profile` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT              COMMENT '主键',
    `tenant_id`        BIGINT       NOT NULL                             COMMENT '租户ID',
    `user_id`          VARCHAR(64)  NOT NULL                             COMMENT '用户ID',
    `behavior_summary` TEXT         DEFAULT NULL                         COMMENT '行为摘要（AI生成）',
    `preferences_json` LONGTEXT     DEFAULT NULL                         COMMENT '偏好JSON',
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP            COMMENT '创建时间',
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP                       COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_user`  (`tenant_id`, `user_id`),
    KEY  `idx_tenant_id`         (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像';

-- 3. t_hyper_advisor_session（超级顾问会话记录）
CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT                  COMMENT '主键',
    `tenant_id`     BIGINT       NOT NULL                                 COMMENT '租户ID',
    `user_id`       VARCHAR(64)  NOT NULL                                 COMMENT '用户ID',
    `session_id`    VARCHAR(128) NOT NULL                                 COMMENT '会话ID',
    `role`          VARCHAR(32)  DEFAULT NULL                             COMMENT '消息角色（user/assistant/system）',
    `content`       LONGTEXT     DEFAULT NULL                             COMMENT '消息内容',
    `metadata_json` TEXT         DEFAULT NULL                             COMMENT '元数据JSON',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP                COMMENT '创建时间',
    `delete_flag`   INT          NOT NULL DEFAULT 0                       COMMENT '删除标记（0正常 1删除）',
    PRIMARY KEY (`id`),
    KEY  `idx_session_id`    (`session_id`),
    KEY  `idx_tenant_user`   (`tenant_id`, `user_id`),
    KEY  `idx_tenant_create` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录';

-- 4. t_advisor_feedback（超级顾问反馈 + 知识提炼标记）
-- 注：此表在历次修复脚本中均被遗漏，是 t_advisor_feedback doesn't exist 错误的根因
CREATE TABLE IF NOT EXISTS `t_advisor_feedback` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT                COMMENT '主键',
    `tenant_id`       BIGINT       NOT NULL                              COMMENT '租户ID',
    `user_id`         VARCHAR(64)  DEFAULT NULL                          COMMENT '用户ID',
    `session_id`      VARCHAR(64)  DEFAULT NULL                          COMMENT '会话ID',
    `trace_id`        VARCHAR(64)  DEFAULT NULL                          COMMENT 'Langfuse trace ID',
    `query_text`      TEXT         DEFAULT NULL                          COMMENT '用户原始提问',
    `advice_text`     TEXT         DEFAULT NULL                          COMMENT 'AI建议摘要',
    `score`           DOUBLE       DEFAULT 0                             COMMENT '评分 0~1（1=好建议）',
    `feedback_text`   VARCHAR(500) DEFAULT NULL                          COMMENT '用户文字反馈',
    `harvested`       INT          NOT NULL DEFAULT 0                    COMMENT '是否已提炼为知识库条目 0=未 1=已',
    `harvested_kb_id` VARCHAR(64)  DEFAULT NULL                          COMMENT '提炼后写入知识库的记录ID',
    `create_time`     DATETIME     DEFAULT CURRENT_TIMESTAMP             COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_feedback_harvest` (`harvested`, `score`),
    KEY `idx_feedback_tenant`  (`tenant_id`),
    KEY `idx_feedback_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-反馈与知识提炼';
