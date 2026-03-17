-- V20260507003: 生产Crew记忆表（ProductionAgenticCrewOrchestrator）
-- 幂等：使用 CREATE TABLE IF NOT EXISTS，列通过 INFORMATION_SCHEMA 添加
-- ⚠️ 注意：此脚本文件名为 V20260507003，用户原提案 V20260317003 会导致 Flyway 乱序故障

-- 1. 创建主表
CREATE TABLE IF NOT EXISTS `t_production_crew_memory` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`    BIGINT       NOT NULL                COMMENT '租户ID',
    `session_id`   VARCHAR(64)  NOT NULL                COMMENT '关联Crew会话UUID',
    `order_no`     VARCHAR(64)  NOT NULL                COMMENT '订单号',
    `plan`         TEXT                                 COMMENT 'LLM生成的行动方案',
    `action_json`  TEXT                                 COMMENT 'Critic修正或附加动作（可空）',
    `health_score` INT          NOT NULL DEFAULT 0      COMMENT '订单健康分 0-100',
    `level`        VARCHAR(10)  NOT NULL DEFAULT ''     COMMENT '健康等级 good/warn/danger',
    `route`        VARCHAR(20)  NOT NULL DEFAULT ''     COMMENT 'AUTO_EXECUTED/CRITIC_REVISED/CRITICAL_ALERT/FAILED',
    `trace_id`     VARCHAR(128)                         COMMENT 'Langfuse trace ID（可空）',
    `create_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_tenant_order` (`tenant_id`, `order_no`),
    KEY `idx_tenant_health` (`tenant_id`, `health_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产Crew AI决策记忆表';

-- 2. 补充列（幂等：后续 schema 演进用此模式添加列，防止 MySQL 8.0 不支持 IF NOT EXISTS）
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_production_crew_memory'
      AND COLUMN_NAME  = 'trace_id'
);
SET @s = IF(@col_exists = 0,
    'ALTER TABLE `t_production_crew_memory` ADD COLUMN `trace_id` VARCHAR(128) NULL COMMENT ''Langfuse trace ID''',
    'SELECT 1 -- trace_id already exists');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
