-- ============================================================
-- V20260319002 — 热修复：提前建立 t_agent_meeting 表
-- 修复 GET /api/intelligence/meeting/list 返回 500 错误
-- 原建表语句来自 V20260417001，因版本日期超前未在云端执行
-- ============================================================

CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `meeting_type` VARCHAR(50) NOT NULL COMMENT '例会类型: daily_standup|risk_review|decision_debate|retrospective',
    `topic` VARCHAR(300) NOT NULL COMMENT '会议主题',
    `participants` VARCHAR(500) COMMENT '参与Agent列表(JSON数组: ["supervisor","delivery_specialist",...])',
    `agenda` TEXT COMMENT '议程(JSON数组)',
    `debate_rounds` TEXT COMMENT '辩论轮次(JSON: [{round,speaker,position,argument,evidence}])',
    `consensus` TEXT COMMENT '最终共识(结论文本)',
    `dissent` TEXT COMMENT '保留意见(少数派观点)',
    `action_items` TEXT COMMENT '决议行动项(JSON数组: [{assignee,task,deadline}])',
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
