-- ============================================================
-- V20260505001 修复V20260308b表名冲突：创建独立的AI执行效果反馈表
--
-- 问题：V20260308b 中的 t_intelligence_feedback 与 V20260307001 冲突
--   - V20260307001 先执行，创建了"智能反馈分析表"（学习闭环用）
--   - V20260308b 的 CREATE TABLE IF NOT EXISTS 被跳过
--   - V20260308b 期望的列（command_id, satisfaction_score等）不存在
--
-- 修复：以新表名 t_intelligence_execution_feedback 创建"AI执行效果反馈表"
-- ============================================================

CREATE TABLE IF NOT EXISTS `t_intelligence_execution_feedback` (
  `id` VARCHAR(64) NOT NULL COMMENT '反馈ID',
  `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
  `command_id` VARCHAR(64) NOT NULL COMMENT '命令ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `satisfaction_score` INT COMMENT '满意度评分 (1-5)',
  `feedback_text` TEXT COMMENT '反馈文本',
  `impact_description` TEXT COMMENT '实际影响描述',
  `feedback_type` VARCHAR(50) COMMENT '反馈类型 (positive/negative/neutral)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_flag` TINYINT(1) DEFAULT 0 COMMENT '删除标志',

  PRIMARY KEY (`id`),
  KEY `idx_tenant_command` (`tenant_id`, `command_id`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_satisfaction` (`satisfaction_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI执行效果反馈表（满意度评分）';
