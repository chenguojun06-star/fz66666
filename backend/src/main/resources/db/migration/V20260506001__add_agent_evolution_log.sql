-- Agent 自进化日志表（v3.20 Agentic Crew Graph 自进化升级）
-- 记录 CriticEvolutionTool 从用户反馈中提炼的优化洞察
-- 符合项目 Flyway 铁则：CREATE TABLE IF NOT EXISTS + 幂等写法

CREATE TABLE IF NOT EXISTS `t_agent_evolution_log` (
    `id`              VARCHAR(36)     NOT NULL              COMMENT '记录ID（UUID）',
    `tenant_id`       BIGINT          NOT NULL              COMMENT '租户ID',
    `scene`           VARCHAR(64)     NOT NULL              COMMENT '触发场景（如 production_analysis）',
    `trigger_type`    VARCHAR(32)     NOT NULL DEFAULT 'feedback_low'
                                                            COMMENT '触发类型：feedback_low=低分反馈触发 / daily_review=每日回顾',
    `insight`         TEXT            DEFAULT NULL          COMMENT 'Critic 提炼的优化洞察文本',
    `qdrant_upserted` TINYINT         NOT NULL DEFAULT 0    COMMENT '是否已写入 Qdrant 向量库（0=否 1=是）',
    `avg_feedback`    DECIMAL(4,2)    DEFAULT NULL          COMMENT '触发时的平均用户反馈分（1-5分）',
    `sample_count`    INT             DEFAULT NULL          COMMENT '样本数量（低分记录条数）',
    `extra_json`      TEXT            DEFAULT NULL          COMMENT '扩展字段（JSON，保留备用）',
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_tenant_scene`  (`tenant_id`, `scene`),
    KEY `idx_tenant_created` (`tenant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='Agent 自进化记录表 — v3.20';
