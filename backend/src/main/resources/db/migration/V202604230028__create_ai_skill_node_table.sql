-- Flyway: V202604230028__create_ai_skill_node_table.sql
-- 功能: AI 技能树自生长系统 — 创建技能节点表
-- 背景: SkillTreeOrchestrator 在 AI 会话成功后自动提取工具调用链，形成可复用技能节点
-- 注意: 本脚本遵循 INFORMATION_SCHEMA 幂等写法，可安全重复执行

CREATE TABLE IF NOT EXISTS `t_ai_skill_node` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`         BIGINT       DEFAULT NULL COMMENT '租户ID，NULL=平台级全局技能',
    `skill_name`        VARCHAR(200) NOT NULL COMMENT '技能名称（AI从会话中提取）',
    `skill_domain`      VARCHAR(50)  DEFAULT NULL COMMENT '领域：PRODUCTION/FINANCE/WAREHOUSE/STYLE/SYSTEM/GENERAL',
    `trigger_pattern`   VARCHAR(500) DEFAULT NULL COMMENT '触发模式：描述何种用户意图会激活本技能',
    `tool_chain`        TEXT         DEFAULT NULL COMMENT '工具链序列（JSON数组，如["tool_scan_undo","tool_order_edit"]）',
    `success_count`     INT          NOT NULL DEFAULT 0 COMMENT '成功执行次数',
    `failure_count`     INT          NOT NULL DEFAULT 0 COMMENT '失败执行次数',
    `avg_score`         DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '平均PRM评分(0-100)',
    `last_activated_at` DATETIME     DEFAULT NULL COMMENT '最后激活时间',
    `parent_skill_id`   BIGINT       DEFAULT NULL COMMENT '父技能节点ID（用于层次结构）',
    `embedding_id`      VARCHAR(100) DEFAULT NULL COMMENT 'Qdrant向量嵌入ID',
    `delete_flag`       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除（0=有效，1=已删除）',
    `create_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_domain` (`tenant_id`, `skill_domain`),
    INDEX `idx_skill_name` (`skill_name`(100)),
    INDEX `idx_parent_skill_id` (`parent_skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
