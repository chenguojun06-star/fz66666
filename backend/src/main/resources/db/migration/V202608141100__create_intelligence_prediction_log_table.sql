-- ============================================================
-- 创建交期预测日志表 t_intelligence_prediction_log
-- 问题背景：该表在本地 DB 是手动 ALTER 创建，从未有 Flyway 迁移脚本覆盖，
--           导致云端/新环境缺失此表，DeliveryPredictionOrchestrator 写预测日志
--           时触发 BadSqlGrammarException，被 catch 静默吞掉（日志仅显示消息，无堆栈）。
-- 修复说明：使用 CREATE TABLE IF NOT EXISTS 幂等模式，保证已存在时无副作用。
-- ============================================================

CREATE TABLE IF NOT EXISTS `t_intelligence_prediction_log` (
  `id`                   varchar(64)     NOT NULL,
  `tenant_id`            bigint          DEFAULT NULL,
  `prediction_id`        varchar(64)     NOT NULL,
  `order_id`             varchar(64)     DEFAULT NULL,
  `order_no`             varchar(100)    DEFAULT NULL,
  `stage_name`           varchar(100)    DEFAULT NULL,
  `process_name`         varchar(100)    DEFAULT NULL,
  `current_progress`     int             DEFAULT NULL,
  `predicted_finish_time` datetime       DEFAULT NULL,
  `actual_finish_time`   datetime        DEFAULT NULL,
  `confidence`           decimal(4,3)    DEFAULT NULL,
  `deviation_minutes`    bigint          DEFAULT NULL,
  `feedback_accepted`    tinyint(1)      DEFAULT NULL,
  `sample_count`         int             DEFAULT NULL,
  `algorithm_version`    varchar(20)     DEFAULT 'rule_v1',
  `create_time`          datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time`          datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `factory_name`         varchar(128)    DEFAULT NULL,
  `daily_velocity`       double          DEFAULT NULL,
  `remaining_qty`        bigint          DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_prediction_id` (`prediction_id`),
  KEY `idx_order_stage` (`order_id`, `stage_name`),
  KEY `idx_tenant_create` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
