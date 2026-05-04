-- ============================================================
-- V202605050600 修复 t_intelligence_feedback 表结构被覆盖
--
-- 问题：V20260308b 的存储过程通过 CALL 执行（绕过 Flyway IF NOT EXISTS），
--   覆盖了 V20260307001 创建的"智能反馈分析表"（学习闭环用），
--   导致当前表结构是"AI执行效果反馈表"（含 command_id, satisfaction_score 等），
--   与 IntelligenceFeedbackRecord Entity 完全不匹配，
--   INSERT 时报 "The error occurred while setting parameters"。
--
-- 修复：
--   1. DROP 旧表（数据量为0，无业务影响）
--   2. 重建为 V20260307001 原始结构
--   3. V20260308b 的"AI执行效果反馈"已通过 V202605050215 创建了
--      t_intelligence_execution_feedback，无需保留旧表
-- ============================================================

DROP TABLE IF EXISTS `t_intelligence_feedback`;

CREATE TABLE `t_intelligence_feedback` (
    `id`                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `tenant_id`            BIGINT          NOT NULL,
    `prediction_id`        VARCHAR(100)    COMMENT '关联预测记录ID',
    `feedback_type`        VARCHAR(50)     COMMENT 'suggestion_adopted/rejected/false_positive',
    `suggestion_type`      VARCHAR(100)    COMMENT '建议类型 assignment/quote/delivery',
    `suggestion_content`   TEXT            COMMENT '建议内容摘要',
    `feedback_result`      VARCHAR(20)     COMMENT 'accepted/rejected/modified',
    `feedback_reason`      VARCHAR(500)    COMMENT '用户反馈原因',
    `feedback_analysis`    TEXT            COMMENT 'AI自动分析反馈原因（类人反思）',
    `deviation_minutes`    BIGINT          COMMENT '预测偏差分钟',
    `optimization_action`  VARCHAR(500)    COMMENT 'AI生成的优化措施',
    `create_time`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_tenant_type`    (tenant_id, feedback_type, create_time),
    INDEX `idx_prediction_id`  (prediction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能反馈分析表（学习闭环）';
