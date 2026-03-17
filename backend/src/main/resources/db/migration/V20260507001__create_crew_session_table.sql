-- V20260507001: 创建 Agentic Crew Graph 会话记录表
-- 对应实体：CrewSession.java
-- 用途：记录每次 Crew Graph 编排的完整执行过程（Planner 规划 → 路由决策 → Critic 修正 → 自进化写入）
-- 设计说明：
--   · route_decision 字段：AUTO_EXECUTED=系统自动执行 / PENDING_REVIEW=等待人工审批 / CRITIC_REVISED=经 Critic 修正
--   · qdrant_synced：执行洞察是否已异步写入 Qdrant 向量库（0=待同步，1=已同步）
--   · health_score：Planner 规划文本的质量评分（0-100），低于 70 则触发人工审批路由

CREATE TABLE IF NOT EXISTS `t_crew_session` (
    `id`             VARCHAR(36)   NOT NULL                    COMMENT '会话 ID（UUID）',
    `tenant_id`      BIGINT        NOT NULL                    COMMENT '租户 ID',
    `user_id`        VARCHAR(64)   DEFAULT NULL                COMMENT '触发用户 ID',
    `natural_goal`   TEXT          DEFAULT NULL                COMMENT '自然语言目标',
    `plan_json`      MEDIUMTEXT    DEFAULT NULL                COMMENT 'Planner 规划输出（JSON or 长文本）',
    `route_decision` VARCHAR(32)   NOT NULL DEFAULT 'PENDING_REVIEW'
                                                              COMMENT 'AUTO_EXECUTED / PENDING_REVIEW / CRITIC_REVISED',
    `health_score`   INT           DEFAULT NULL                COMMENT '规划健康分（0-100）',
    `result_summary` TEXT          DEFAULT NULL                COMMENT '执行结果摘要',
    `status`         VARCHAR(16)   NOT NULL DEFAULT 'RUNNING'  COMMENT 'RUNNING / COMPLETED / PENDING / FAILED',
    `trace_id`       VARCHAR(64)   DEFAULT NULL                COMMENT 'Langfuse trace ID',
    `latency_ms`     BIGINT        DEFAULT NULL                COMMENT '端到端耗时 ms',
    `critic_insight` TEXT          DEFAULT NULL                COMMENT 'Critic 优化洞察（异步回写）',
    `qdrant_synced`  TINYINT       NOT NULL DEFAULT 0          COMMENT '是否已写 Qdrant（0=待同步，1=已同步）',
    `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_status`  (`tenant_id`, `status`),
    KEY `idx_tenant_created` (`tenant_id`, `created_at`),
    KEY `idx_tenant_health`  (`tenant_id`, `health_score`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_bin
  COMMENT='Agentic Crew Graph 会话记录 — v3.20 (智能规划 + 蒙特卡洛 + 自进化闭环)';
