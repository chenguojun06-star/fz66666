-- Hybrid Graph MAS v4.0 MVP: 多代理图执行日志表
-- 幂等脚本（CREATE TABLE IF NOT EXISTS 支持重复执行）

CREATE TABLE IF NOT EXISTS `t_agent_execution_log` (
  `id`                      BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`               BIGINT       NOT NULL                   COMMENT '租户ID',
  `scene`                   VARCHAR(50)  DEFAULT NULL               COMMENT '分析场景 delivery_risk|sourcing|compliance|logistics|full',
  `route`                   VARCHAR(100) DEFAULT NULL               COMMENT 'Supervisor 路由决策',
  `context_summary`         TEXT         DEFAULT NULL               COMMENT '分析摘要文本',
  `reflection`              TEXT         DEFAULT NULL               COMMENT 'LLM 批判性反思内容',
  `optimization_suggestion` TEXT         DEFAULT NULL               COMMENT '优化建议',
  `confidence_score`        INT          DEFAULT 0                  COMMENT '置信分 0-100',
  `status`                  VARCHAR(20)  DEFAULT 'COMPLETED'        COMMENT 'COMPLETED|ERROR',
  `latency_ms`              BIGINT       DEFAULT 0                  COMMENT '执行耗时（毫秒）',
  `create_time`             DATETIME     DEFAULT NULL               COMMENT '执行时间',
  PRIMARY KEY (`id`),
  KEY `idx_aex_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='多代理图执行日志（Hybrid Graph MAS v4.0）';
